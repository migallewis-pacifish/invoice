const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { randomUUID, createHash } = require('crypto');
const { createGmailProvider } = require('./email/providers/gmail');
const { createMicrosoftProvider } = require('./email/providers/microsoft');
const { dispatchEmail, resolveRoute } = require('./email/dispatcher');
const { createSendCoordinator, recordIdFor, sanitizedError } = require('./email/send-coordinator');
const { verifySendGridSignature, normalizeSendGridEvent, eventUpdate, suppressionBlockReason } = require('./email/email-status');

admin.initializeApp();

const sendGridApiKey = defineSecret('SENDGRID_API_KEY');
const sendGridFromEmail = defineSecret('SENDGRID_FROM_EMAIL');
const sendGridEventWebhookPublicKey = defineSecret('SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY');
// JSON object keyed by company ID. This administrator-managed Secret Manager
// value is the only supported location for company SendGrid API keys.
const companySendGridCredentials = defineSecret('COMPANY_SENDGRID_CREDENTIALS');
// Gmail intentionally has its own OAuth application. Do not substitute Drive
// credentials unless that OAuth client was explicitly registered for both.
const gmailClientId = defineSecret('GMAIL_OAUTH_CLIENT_ID');
const gmailClientSecret = defineSecret('GMAIL_OAUTH_CLIENT_SECRET');
const gmailRedirectUri = defineSecret('GMAIL_OAUTH_REDIRECT_URI');
const microsoftEmailClientId = defineSecret('MICROSOFT_EMAIL_OAUTH_CLIENT_ID');
const microsoftEmailClientSecret = defineSecret('MICROSOFT_EMAIL_OAUTH_CLIENT_SECRET');
const microsoftEmailRedirectUri = defineSecret('MICROSOFT_EMAIL_OAUTH_REDIRECT_URI');
// Comma-separated Entra tenant IDs. Microsoft email OAuth is deliberately
// unavailable until an explicit single-tenant or tenant allow-list policy exists.
const microsoftEmailAllowedTenants = defineSecret('MICROSOFT_EMAIL_ALLOWED_TENANTS');

function gmailProvider() {
  return createGmailProvider({
    db: admin.firestore(),
    clientId: () => gmailClientId.value(),
    clientSecret: () => gmailClientSecret.value(),
    redirectUri: () => gmailRedirectUri.value(),
  });
}

function microsoftEmailProvider() {
  return createMicrosoftProvider({
    db: admin.firestore(), clientId: () => microsoftEmailClientId.value(),
    clientSecret: () => microsoftEmailClientSecret.value(), redirectUri: () => microsoftEmailRedirectUri.value(),
    allowedTenants: () => microsoftEmailAllowedTenants.value(),
  });
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// SendGrid limits the complete message (including base64 expansion) to 30 MB.
// Keeping source documents at or below 20 MiB leaves room for that expansion
// and for the rest of the MIME message.
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function normalizeEmailList(value) {
  if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean);
  return String(value || '').split(/[;,]/).map(v => v.trim()).filter(Boolean);
}

function resolveEmailProvider(requestedProvider, companyDefault) {
  return requestedProvider || companyDefault || 'nexus_fallback';
}

function validatePayload(data) {
  const errors = [];
  if (!data.companyId) errors.push('companyId is required');
  if (!data.clientId) errors.push('clientId is required');
  if (data.documentType !== 'invoice' && data.documentType !== 'letter') errors.push('documentType must be invoice or letter');
  if (!data.documentId) errors.push('documentId is required');
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(String(data.idempotencyKey || ''))) errors.push('idempotencyKey must be 16-128 URL-safe characters');
  for (const [field, value] of [['companyId', data.companyId], ['clientId', data.clientId], ['documentId', data.documentId]]) {
    if (value && !/^[A-Za-z0-9_-]{1,128}$/.test(String(value))) errors.push(`${field} is invalid`);
  }
  if (!EMAIL_PATTERN.test(data.recipient || '')) errors.push('recipient email is invalid');
  for (const email of [...normalizeEmailList(data.cc), ...normalizeEmailList(data.bcc)]) {
    if (!EMAIL_PATTERN.test(email)) errors.push(`copy recipient is invalid: ${email}`);
  }
  if (!String(data.subject || '').trim()) errors.push('subject is required');
  if (!String(data.messageBody || '').trim() && data.templateSelection?.kind !== 'designed') errors.push('messageBody is required');
  if (data.templateSelection?.kind === 'designed' && !String(data.templateSelection.templateId || '').trim()) errors.push('templateSelection.templateId is required');
  if (data.attachment?.generatedDocumentPayloadRef) errors.push('attachment.generatedDocumentPayloadRef is not supported; provide attachment.storagePath');
  if (!data.attachment?.storagePath) errors.push('attachment.storagePath is required');
  return errors;
}

const DOCUMENT_COLLECTIONS = Object.freeze({ invoice: 'invoices', letter: 'letters' });

async function loadEmailDocument(data, db = admin.firestore()) {
  const collection = DOCUMENT_COLLECTIONS[data.documentType];
  if (!collection) throw new HttpsError('invalid-argument', 'documentType must be invoice or letter');
  const path = `companies/${data.companyId}/clients/${data.clientId}/${collection}/${data.documentId}`;
  const snapshot = await db.doc(path).get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'The requested document was not found for this client.');
  const record = snapshot.data() || {};
  const expected = { companyId: String(data.companyId), clientId: String(data.clientId), documentType: data.documentType, documentId: String(data.documentId) };
  const aliases = { documentId: record.documentId ?? record.id, documentType: record.documentType ?? record.type };
  for (const [field, expectedValue] of Object.entries(expected)) {
    const actual = field in aliases ? aliases[field] : record[field];
    if (actual !== undefined && String(actual) !== expectedValue) {
      throw new HttpsError('failed-precondition', `The stored document ${field} does not match its location.`);
    }
  }
  return { ...expected, record, path };
}

function documentAttachmentPaths(record) {
  const values = [record.attachmentStoragePath, record.storagePath, record.documentStoragePath, record.filePath];
  const outputs = Array.isArray(record.generatedOutputs) ? record.generatedOutputs : [];
  for (const output of outputs) values.push(typeof output === 'string' ? output : output?.storagePath);
  return new Set(values.filter(value => typeof value === 'string' && value));
}

function documentAttachmentFilename(record, storagePath) {
  const output = (Array.isArray(record.generatedOutputs) ? record.generatedOutputs : [])
    .find(value => typeof value === 'object' && value?.storagePath === storagePath);
  if (output?.fileName) return output.fileName;
  if ([record.attachmentStoragePath, record.storagePath, record.documentStoragePath, record.filePath].includes(storagePath)) {
    return record.attachmentFileName || record.fileName;
  }
  return undefined;
}

function validateAttachmentPath(companyId, storagePath) {
  const company = String(companyId || '');
  const path = String(storagePath || '');
  const prefix = `companies/${company}/generated/`;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(company) || !path.startsWith(prefix)) {
    throw new HttpsError('invalid-argument', `Attachment must be stored under ${prefix}`);
  }
  const relativePath = path.slice(prefix.length);
  if (!relativePath || path.includes('\\') || path.includes('//') || relativePath.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new HttpsError('invalid-argument', 'Attachment storage path is not canonical.');
  }
  return path;
}

function validatedAttachmentFilename(requestedName, storagePath) {
  const name = String(requestedName || storagePath.split('/').pop() || '');
  if (!/^[A-Za-z0-9][A-Za-z0-9._ -]{0,254}$/.test(name) || name === '.' || name === '..') {
    throw new HttpsError('invalid-argument', 'Attachment filename is invalid.');
  }
  return name;
}

async function resolveEmailAttachment(data, document, bucket = admin.storage().bucket()) {
  const attachment = data.attachment || {};
  if (attachment.generatedDocumentPayloadRef) {
    throw new HttpsError('invalid-argument', 'attachment.generatedDocumentPayloadRef is not supported; generated documents must first be stored in company-scoped Storage.');
  }
  if (!document?.record) throw new HttpsError('failed-precondition', 'A loaded document is required to resolve an attachment.');
  const storagePath = validateAttachmentPath(document.companyId, attachment.storagePath);
  if (!documentAttachmentPaths(document.record).has(storagePath)) {
    throw new HttpsError('permission-denied', 'The attachment is not an output recorded on the requested document.');
  }
  const file = bucket.file(storagePath);
  let metadata;
  try {
    [metadata] = await file.getMetadata();
  } catch (error) {
    if (error?.code === 404 || error?.code === '404') throw new HttpsError('not-found', 'Attachment was not found.');
    throw error;
  }
  const type = String(metadata.contentType || '').toLowerCase();
  if (!ALLOWED_ATTACHMENT_TYPES.has(type)) throw new HttpsError('invalid-argument', 'Attachment MIME type is not allowed.');
  const declaredSize = Number(metadata.size);
  if (!Number.isSafeInteger(declaredSize) || declaredSize < 0) throw new HttpsError('failed-precondition', 'Attachment size metadata is invalid.');
  if (declaredSize > MAX_ATTACHMENT_BYTES) throw new HttpsError('invalid-argument', 'Attachment exceeds the email provider size limit.');
  const [bytes] = await file.download();
  if (!Buffer.isBuffer(bytes) || bytes.length !== declaredSize) throw new HttpsError('failed-precondition', 'Attachment size does not match its Storage metadata.');
  if (bytes.length > MAX_ATTACHMENT_BYTES) throw new HttpsError('invalid-argument', 'Attachment exceeds the email provider size limit.');
  return {
    filename: validatedAttachmentFilename(documentAttachmentFilename(document.record, storagePath), storagePath),
    type,
    disposition: 'attachment',
    content: bytes.toString('base64'),
  };
}

function isCompanyMember(uid, companyId, userCompanyId, users = []) {
  return userCompanyId === companyId || users.includes(uid);
}

async function assertCompanyMember(uid, companyId) {
  const [userSnap, companySnap] = await Promise.all([
    admin.firestore().doc(`users/${uid}`).get(),
    admin.firestore().doc(`companies/${companyId}`).get(),
  ]);
  const userCompanyId = userSnap.get('companyId');
  const users = companySnap.get('users') || [];
  if (!isCompanyMember(uid, companyId, userCompanyId, users)) {
    throw new HttpsError('permission-denied', 'You are not a member of this company.');
  }
  return companySnap;
}

const APPROVED_TEMPLATE_VARIABLES = new Set(['clientName', 'invoiceNumber', 'dueDate', 'total', 'companyName', 'paymentReference', 'outstandingBalance', 'daysOverdue', 'company.name', 'company.email', 'company.phone', 'company.address', 'company.logoUrl', 'signature.name', 'signature.imageUrl', 'client.name', 'client.email', 'invoice.number', 'invoice.date', 'invoice.dueDate', 'invoice.subtotal', 'invoice.vat', 'invoice.total', 'invoice.outstandingBalance', 'invoice.daysOverdue']);

function lookupVariable(source, path) {
  return path.split('.').reduce((value, key) => value && typeof value === 'object' ? value[key] : undefined, source);
}

function renderFreeMarkerTemplate(template, variables = {}) {
  const unresolved = new Set();
  const html = String(template || '').replace(/\$\{\s*([a-zA-Z0-9_.]+)\s*}/g, (_, key) => {
    if (!APPROVED_TEMPLATE_VARIABLES.has(key)) {
      unresolved.add(key);
      return '';
    }
    const value = lookupVariable(variables, key);
    if (value === undefined || value === null || value === '') {
      unresolved.add(key);
      return '';
    }
    return String(value);
  });
  return { html, unresolved: Array.from(unresolved) };
}

function htmlToText(html) {
  return String(html || '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function loadDesignedTemplate(data) {
  if (data.templateSelection?.kind !== 'designed') return null;
  const templateId = String(data.templateSelection.templateId || '').trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(templateId)) throw new HttpsError('invalid-argument', 'Designed template ID is invalid.');
  const snap = await admin.firestore().doc(`companies/${data.companyId}/emailDesignTemplates/${templateId}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Designed email template was not found.');
  const template = snap.data() || {};
  const expectedPath = `companies/${data.companyId}/email-design-templates/${templateId}.ftl`;
  if (template.freemarkerStoragePath !== expectedPath) throw new HttpsError('failed-precondition', 'Designed email template storage path is not valid.');
  const [buffer] = await admin.storage().bucket().file(expectedPath).download();
  const rendered = renderFreeMarkerTemplate(buffer.toString('utf8'), data.templateVariables || {});
  if (rendered.unresolved.length) throw new HttpsError('invalid-argument', `Designed email template has unresolved variables: ${rendered.unresolved.join(', ')}`);
  return { html: rendered.html, text: htmlToText(rendered.html) || data.messageBody || data.subject };
}

async function buildEmailContent(data) {
  const designed = await loadDesignedTemplate(data);
  return designed
    ? [{ type: 'text/plain', value: designed.text }, { type: 'text/html', value: designed.html }]
    : [{ type: 'text/plain', value: data.messageBody }];
}

function validatedDisplayName(value) {
  const name = String(value || '').trim();
  return name && name.length <= 100 && !/[\r\n<>]/.test(name) ? name : undefined;
}

function buildSendGridPayload(message, fromEmail, metadata, options = {}) {
  const fromName = options.fromNameValidated ? validatedDisplayName(options.fromName) : undefined;
  return {
    personalizations: [{
      to: message.to.map(email => ({ email })),
      cc: message.cc.map(email => ({ email })),
      bcc: message.bcc.map(email => ({ email })),
    }],
    from: { email: fromEmail, name: fromName },
    ...(options.replyTo && EMAIL_PATTERN.test(options.replyTo) ? { reply_to: { email: options.replyTo } } : {}),
    subject: message.subject,
    content: [{ type: 'text/plain', value: message.text }, ...(message.html ? [{ type: 'text/html', value: message.html }] : [])],
    attachments: message.attachments,
    custom_args: metadata,
  };
}

async function sendWithSendGrid(message, credentials, metadata, options = {}) {
  const apiKey = credentials.apiKey;
  const fromEmail = credentials.fromEmail;
  if (!apiKey || !fromEmail) {
    throw new HttpsError('failed-precondition', 'Email provider secrets are not configured.');
  }

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildSendGridPayload(message, fromEmail, metadata, options)),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new HttpsError('internal', `SendGrid rejected the email (${response.status}): ${text.slice(0, 300)}`);
  }
  return response.headers.get('x-message-id') || `sendgrid-${Date.now()}`;
}

async function sendWithGmail(message) {
  try { return await gmailProvider().send(message.sender.companyId, message); }
  catch (error) { throw new HttpsError(error.message === 'not_connected' ? 'failed-precondition' : 'internal', `Gmail send failed: ${error.message}`); }
}

async function sendWithMicrosoftGraph(message, integrations) {
  try { return await microsoftEmailProvider().send(message.sender.companyId, message, integrations.selectedSender); }
  catch (error) {
    const expected = ['not_connected', 'expired_consent', 'tenant_not_allowed', 'sender_not_authorized'];
    throw new HttpsError(expected.includes(error.message) ? 'failed-precondition' : error.message === 'graph_throttled' ? 'resource-exhausted' : 'internal', `Microsoft Graph send failed: ${error.message}`);
  }
}

async function sendWithCompanySendGrid(message, integrations) {
  const settings = integrations.sendgrid || {};
  const credentials = companySendGridCredential(message.sender.companyId);
  if (!settings.connected || (!settings.senderVerified && !settings.domainVerified) || credentials.fromEmail !== settings.fromEmail) {
    throw new HttpsError('failed-precondition', 'The company SendGrid sender has not been verified.');
  }
  await validateCompanySendGridCredential(credentials);
  return sendWithSendGrid(message, credentials, message.sender.metadata, {
    fromName: credentials.fromName, fromNameValidated: settings.fromNameValidated === true,
  });
}

async function sendWithNexusFallback(message) {
  const configuredFrom = String(sendGridFromEmail.value() || '').trim().toLowerCase();
  const nexusDomain = String(process.env.NEXUS_SENDGRID_DOMAIN || '').trim().toLowerCase();
  if (!nexusDomain || configuredFrom.split('@')[1] !== nexusDomain) {
    throw new HttpsError('failed-precondition', 'The Nexus sender must use the administrator-approved Nexus domain.');
  }
  return sendWithSendGrid(
    message,
    { apiKey: sendGridApiKey.value(), fromEmail: sendGridFromEmail.value() },
    message.sender.metadata,
    {
      replyTo: message.sender.replyToEmail,
      fromName: message.sender.companyName,
      fromNameValidated: true,
    }
  );
}

function nexusEnabled() {
  return process.env.NEXUS_EMAIL_ENABLED === 'true';
}

function nexusLimits() {
  return {
    hourly: Math.max(1, Number(process.env.NEXUS_EMAIL_HOURLY_LIMIT) || 50),
    daily: Math.max(1, Number(process.env.NEXUS_EMAIL_DAILY_LIMIT) || 250),
  };
}

function recipientHash(email) {
  return createHash('sha256').update(String(email || '').trim().toLowerCase()).digest('hex');
}

async function reserveNexusCapacity(companyId, recipient) {
  if (!nexusEnabled()) throw new HttpsError('failed-precondition', 'Nexus managed email is disabled by an administrator.');
  const db = admin.firestore();
  const suppression = await db.doc(`companies/${companyId}/emailSuppressions/${recipientHash(recipient)}`).get();
  if (suppression.exists && suppression.get('active') !== false) {
    throw new HttpsError('failed-precondition', 'The recipient is suppressed due to a bounce, complaint, or unsubscribe.');
  }
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const hour = now.toISOString().slice(0, 13).replace(/[:T]/g, '-');
  const dailyRef = db.doc(`companies/${companyId}/emailUsage/${day}`);
  const hourlyRef = db.doc(`companies/${companyId}/emailUsage/${day}-${hour}`);
  const limits = nexusLimits();
  await db.runTransaction(async transaction => {
    const [dailySnap, hourlySnap] = await Promise.all([transaction.get(dailyRef), transaction.get(hourlyRef)]);
    const dailyCount = Number(dailySnap.get('count') || 0);
    const hourlyCount = Number(hourlySnap.get('count') || 0);
    if (dailyCount >= limits.daily) throw new HttpsError('resource-exhausted', 'The company daily Nexus email quota has been reached.');
    if (hourlyCount >= limits.hourly) throw new HttpsError('resource-exhausted', 'The company Nexus email rate limit has been reached.');
    transaction.set(dailyRef, { count: dailyCount + 1, period: 'day', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(hourlyRef, { count: hourlyCount + 1, period: 'hour', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  });
}

function companySendGridCredential(companyId) {
  let credentials;
  try { credentials = JSON.parse(companySendGridCredentials.value() || '{}')[companyId]; }
  catch (_) { throw new HttpsError('failed-precondition', 'Company SendGrid credential secret is invalid.'); }
  if (!credentials?.apiKey || !EMAIL_PATTERN.test(credentials?.fromEmail || '')) {
    throw new HttpsError('failed-precondition', 'Company SendGrid credentials are not provisioned by an administrator.');
  }
  return credentials;
}

async function sendGridJson(apiKey, path) {
  const response = await fetch(`https://api.sendgrid.com/v3/${path}`, { headers: { Authorization: `Bearer ${apiKey}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpsError('failed-precondition', `SendGrid connection test failed (${response.status}).`);
  return body;
}

async function validateCompanySendGridCredential(credentials) {
  await sendGridJson(credentials.apiKey, 'scopes');
  const [sendersBody, domainsBody] = await Promise.all([
    sendGridJson(credentials.apiKey, 'verified_senders'),
    sendGridJson(credentials.apiKey, 'whitelabel/domains'),
  ]);
  const senderVerified = (sendersBody.results || []).some(sender => sender.verified === true && String(sender.from_email || '').toLowerCase() === credentials.fromEmail.toLowerCase());
  const domain = credentials.fromEmail.split('@')[1].toLowerCase();
  const domainVerified = (Array.isArray(domainsBody) ? domainsBody : []).some(item => item.valid === true && (domain === String(item.domain || '').toLowerCase() || domain.endsWith(`.${String(item.domain || '').toLowerCase()}`)));
  if (!senderVerified && !domainVerified) throw new HttpsError('failed-precondition', 'SendGrid From address or domain is not verified.');
  return { senderVerified, domainVerified };
}

async function companyEmailIntegrations(companyId) {
  const [preferences, status] = await Promise.all([
    admin.firestore().doc(`companies/${companyId}/emailIntegration/preferences`).get(),
    admin.firestore().doc(`companies/${companyId}/emailIntegration/status`).get(),
  ]);
  const preferenceData = preferences.exists ? preferences.data() : {};
  const statusData = status.exists ? status.data() : {};
  return {
    ...preferenceData,
    ...statusData,
    nexusFallback: { ...statusData.nexusFallback, ...preferenceData.nexusFallback },
  };
}

const microsoftEmailSecrets = [microsoftEmailClientId, microsoftEmailClientSecret, microsoftEmailRedirectUri, microsoftEmailAllowedTenants];

exports.sendDocumentEmail = onCall({ secrets: [sendGridApiKey, sendGridFromEmail, companySendGridCredentials, gmailClientId, gmailClientSecret, gmailRedirectUri, ...microsoftEmailSecrets] }, async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in is required to send email.');
  const data = request.data || {};
  const errors = validatePayload(data);
  if (errors.length) throw new HttpsError('invalid-argument', errors.join('; '));
  const companySnap = await assertCompanyMember(request.auth.uid, data.companyId);
  const document = await loadEmailDocument(data);
  const company = companySnap.data() || {};
  const integrations = await companyEmailIntegrations(data.companyId);
  if (integrations.onboardingCompleted !== true) {
    throw new HttpsError('failed-precondition', 'Choose and save an email provider in company settings before sending.');
  }
  const nexusConfigured = nexusEnabled() && !!sendGridApiKey.value() && !!sendGridFromEmail.value();
  const configuration = { gmail: gmailProvider().configured(), microsoftExchange: microsoftEmailProvider().configured(), nexusFallback: nexusConfigured };
  const route = resolveRoute(data.provider, integrations, configuration);
  const suppression = await admin.firestore().doc(`companies/${data.companyId}/emailSuppressions/${recipientHash(data.recipient)}`).get();
  const suppressionReason = suppressionBlockReason(suppression.exists ? suppression.data() : null);
  if (suppressionReason) throw new HttpsError('failed-precondition', suppressionReason);
  const replyToEmail = String(integrations.nexusFallback?.replyToEmail || '').trim().toLowerCase();
  if (route.provider === 'nexus_fallback') {
    if (!EMAIL_PATTERN.test(replyToEmail)) throw new HttpsError('failed-precondition', 'A valid company Reply-To address is required for Nexus managed email.');
    if (replyToEmail !== String(company.email || '').trim().toLowerCase()) {
      throw new HttpsError('failed-precondition', 'The Nexus Reply-To address must match the validated company email.');
    }
    await reserveNexusCapacity(data.companyId, data.recipient);
  }
  const content = await buildEmailContent(data);
  const message = {
    to: [data.recipient], cc: normalizeEmailList(data.cc), bcc: normalizeEmailList(data.bcc),
    subject: data.subject,
    text: content.find(item => item.type === 'text/plain')?.value || '',
    html: content.find(item => item.type === 'text/html')?.value,
    attachments: [await resolveEmailAttachment(data, document)],
    sender: { ...integrations.selectedSender, companyName: company.name, replyToEmail, companyId: document.companyId, metadata: {
      companyId: document.companyId, clientId: document.clientId, documentType: document.documentType,
      documentId: document.documentId, storagePath: data.attachment.storagePath,
      sendRecordId: recordIdFor(data),
    } },
  };
  const coordinate = createSendCoordinator({ db: admin.firestore(), FieldValue: admin.firestore.FieldValue });
  return coordinate({
    data: { ...data, cc: normalizeEmailList(data.cc), bcc: normalizeEmailList(data.bcc), recipientHash: recipientHash(data.recipient) },
    document, uid: request.auth.uid, route,
    effectiveFrom: route.provider === 'nexus_fallback'
      ? sendGridFromEmail.value()
      : (integrations.selectedSender?.email || company.email || undefined),
    dispatch: () => dispatchEmail({
      requestedProvider: data.provider, integrations, message, configuration,
      adapters: { gmail: sendWithGmail, microsoft_exchange: sendWithMicrosoftGraph, company_sendgrid: sendWithCompanySendGrid, nexus_fallback: sendWithNexusFallback },
    }),
  });
});

exports.verifyCompanySendGrid = onCall({ secrets: [companySendGridCredentials] }, async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in is required.');
  const { companyId } = request.data || {};
  if (!companyId) throw new HttpsError('invalid-argument', 'companyId is required.');
  await assertCompanyMember(request.auth.uid, companyId);
  const credentials = companySendGridCredential(companyId);
  const validation = await validateCompanySendGridCredential(credentials);
  const privateState = {
    mode: 'company_owned_sendgrid', connected: true, apiKeyConfigured: true,
    credentialReference: `COMPANY_SENDGRID_CREDENTIALS:${companyId}`,
    fromEmail: credentials.fromEmail, fromName: validatedDisplayName(credentials.fromName),
    fromNameValidated: !!validatedDisplayName(credentials.fromName), ...validation,
    connectionTestedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const publicState = { mode: 'company_owned_sendgrid', connected: true, apiKeyConfigured: true };
  await admin.firestore().doc(`companies/${companyId}/privateEmailTokens/company_sendgrid`).set(privateState, { merge: true });
  await admin.firestore().doc(`companies/${companyId}/emailIntegration/status`).set({ sendgrid: publicState }, { merge: true });
  return publicState;
});

const gmailSecrets = [gmailClientId, gmailClientSecret, gmailRedirectUri];

exports.getEmailProviderConfiguration = onCall({ secrets: [...gmailSecrets, ...microsoftEmailSecrets, sendGridApiKey, sendGridFromEmail] }, async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in is required.');
  const nexusFallback = nexusEnabled() && !!sendGridApiKey.value() && !!sendGridFromEmail.value();
  return { gmail: gmailProvider().configured(), microsoftExchange: microsoftEmailProvider().configured(), nexusFallback, nexusFromEmail: nexusFallback ? sendGridFromEmail.value() : undefined, microsoftTenantPolicy: microsoftEmailProvider().tenantPolicy().mode };
});

// Configure SendGrid Event Webhook with Twilio SendGrid signed-event verification.
// The public verification key is safe to rotate independently of API credentials.
exports.sendGridEventWebhook = onRequest({ secrets: [sendGridEventWebhookPublicKey] }, async (request, response) => {
  const signature = request.get('x-twilio-email-event-webhook-signature');
  const timestamp = request.get('x-twilio-email-event-webhook-timestamp');
  if (!verifySendGridSignature({
    publicKey: sendGridEventWebhookPublicKey.value(), signature, timestamp,
    rawBody: request.rawBody,
  })) {
    response.status(401).send('Invalid webhook signature'); return;
  }

  const events = Array.isArray(request.body) ? request.body.slice(0, 1000) : [];
  const db = admin.firestore();
  for (const rawEvent of events) {
    const event = normalizeSendGridEvent(rawEvent);
    if (!event?.companyId || !EMAIL_PATTERN.test(event.email)) continue;
    let recordRef = event.sendRecordId
      ? db.doc(`companies/${event.companyId}/emailSendRecords/${event.sendRecordId}`) : null;
    if (!recordRef && event.providerMessageId) {
      const matches = await db.collection(`companies/${event.companyId}/emailSendRecords`)
        .where('providerMessageId', '==', event.providerMessageId).limit(1).get();
      recordRef = matches.empty ? null : matches.docs[0].ref;
    }
    if (!recordRef) continue; // Valid provider event, but not one of our sends.

    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(recordRef);
      if (!snapshot.exists) return;
      const current = snapshot.data() || {};
      const update = eventUpdate(current, event);
      if (!update || update.ignored) return;
      const processedEventIds = [...(current.processedEventIds || []).slice(-49), event.eventId];
      const now = admin.firestore.FieldValue.serverTimestamp();
      const recordUpdate = {
        status: update.status, providerEvent: update.providerEvent,
        providerEventId: update.providerEventId, providerEventTimestamp: update.providerEventTimestamp,
        failureReason: update.failureReason, processedEventIds, updatedAt: now,
      };
      transaction.set(recordRef, recordUpdate, { merge: true });
      if (current.documentPath) {
        transaction.update(db.doc(current.documentPath), {
          'lastEmail.status': update.status, 'lastEmail.failureReason': update.failureReason,
          'lastEmail.updatedAt': now, updatedAt: now,
        });
      }
      if (current.documentType === 'invoice') {
        transaction.update(db.doc(`companies/${event.companyId}/invoiceSummaries/${current.documentId}`), {
          'lastEmail.status': update.status, 'lastEmail.failureReason': update.failureReason,
          'lastEmail.updatedAt': now, updatedAt: now,
        });
      }
      if (event.suppress) {
        transaction.set(db.doc(`companies/${event.companyId}/emailSuppressions/${recipientHash(event.email)}`), {
          active: true, companyId: event.companyId, clientId: current.clientId || null,
          recipientHash: recipientHash(event.email), reason: update.status,
          provider: current.effectiveProvider || 'sendgrid', sendRecordId: recordRef.id,
          updatedAt: now,
        }, { merge: true });
      }
    });
  }
  response.status(204).send();
});

exports.startGmailOAuth = onCall({ secrets: gmailSecrets }, async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in is required.');
  const { companyId, accountEmail } = request.data || {};
  if (!companyId) throw new HttpsError('invalid-argument', 'companyId is required.');
  await assertCompanyMember(request.auth.uid, companyId);
  try {
    return { url: await gmailProvider().start({ uid: request.auth.uid, companyId, requestedMailbox: accountEmail }) };
  } catch (error) {
    throw new HttpsError('failed-precondition', error.message);
  }
});

exports.gmailOAuthCallback = onRequest({ secrets: gmailSecrets }, async (request, response) => {
  const state = String(request.query.state || '');
  try {
    const result = await gmailProvider().callback({ state, code: String(request.query.code || '') });
    response.redirect(302, `/settings?emailOAuth=gmail&result=success&companyId=${encodeURIComponent(result.companyId)}`);
  } catch (error) {
    response.redirect(302, `/settings?emailOAuth=gmail&result=error&reason=${encodeURIComponent(error.message)}`);
  }
});

exports.checkGmailConnection = onCall({ secrets: gmailSecrets }, async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in is required.');
  const { companyId } = request.data || {};
  await assertCompanyMember(request.auth.uid, companyId);
  return gmailProvider().health(companyId);
});

exports.disconnectGmail = onCall({ secrets: gmailSecrets }, async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in is required.');
  const { companyId } = request.data || {};
  await assertCompanyMember(request.auth.uid, companyId);
  return gmailProvider().disconnect(companyId);
});

exports.startMicrosoftEmailOAuth = onCall({ secrets: microsoftEmailSecrets }, async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in is required.');
  const { companyId, accountEmail } = request.data || {};
  if (!companyId) throw new HttpsError('invalid-argument', 'companyId is required.');
  await assertCompanyMember(request.auth.uid, companyId);
  try { return { url: await microsoftEmailProvider().start({ uid: request.auth.uid, companyId, loginHint: accountEmail }) }; }
  catch (error) { throw new HttpsError('failed-precondition', error.message); }
});

exports.microsoftEmailOAuthCallback = onRequest({ secrets: microsoftEmailSecrets }, async (request, response) => {
  try {
    const result = await microsoftEmailProvider().callback({ state: String(request.query.state || ''), code: String(request.query.code || '') });
    response.redirect(302, `/settings?emailOAuth=microsoft_exchange&result=success&companyId=${encodeURIComponent(result.companyId)}`);
  } catch (error) { response.redirect(302, `/settings?emailOAuth=microsoft_exchange&result=error&reason=${encodeURIComponent(error.message)}`); }
});

exports.refreshMicrosoftEmailConnection = onCall({ secrets: microsoftEmailSecrets }, async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in is required.');
  const { companyId } = request.data || {};
  await assertCompanyMember(request.auth.uid, companyId);
  const auth = await microsoftEmailProvider().refresh(companyId);
  return { connected: true, accountEmail: auth.accountEmail, tenantId: auth.tenantId };
});

exports.checkMicrosoftEmailConnection = onCall({ secrets: microsoftEmailSecrets }, async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in is required.');
  const { companyId } = request.data || {};
  await assertCompanyMember(request.auth.uid, companyId);
  return microsoftEmailProvider().health(companyId);
});

exports.disconnectMicrosoftEmail = onCall({ secrets: microsoftEmailSecrets }, async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in is required.');
  const { companyId } = request.data || {};
  await assertCompanyMember(request.auth.uid, companyId);
  return microsoftEmailProvider().disconnect(companyId);
});


function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const REMINDER_MAX_ATTEMPTS = 5;
const REMINDER_LEASE_MS = 10 * 60 * 1000;
const EMAIL_PROVIDER_SECRETS = [sendGridApiKey, sendGridFromEmail, companySendGridCredentials, gmailClientId, gmailClientSecret, gmailRedirectUri, ...microsoftEmailSecrets];

function cadenceDate(date) {
  return date.toISOString().slice(0, 10);
}

function reminderDedupKey(companyId, invoiceId, reminderType, date) {
  return [companyId, invoiceId, reminderType, cadenceDate(date)].join(':');
}

function reminderQueueId(companyId, invoiceId, reminderType, date) {
  return [companyId, invoiceId, reminderType, cadenceDate(date)]
    .map(value => encodeURIComponent(String(value)).replace(/%/g, '_')).join('__');
}

function overdueReminderPolicy(company) {
  const policy = company.reminderPolicy || company.invoiceReminderPolicy || {};
  const overdue = policy.overdue || {};
  return {
    enabled: policy.enabled === true && overdue.enabled !== false,
    cadenceDays: Math.max(1, Math.min(365, Number(overdue.cadenceDays || policy.cadenceDays) || 7)),
    subject: String(overdue.subject || 'Payment reminder for invoice {{invoiceNumber}}'),
    body: String(overdue.body || 'Your invoice {{invoiceNumber}} is overdue. Please arrange payment of {{outstandingBalance}}.'),
  };
}

function replaceReminderVariables(template, values) {
  return String(template).replace(/{{\s*(invoiceNumber|outstandingBalance|dueDate|clientName|companyName)\s*}}/g,
    (_, key) => String(values[key] ?? ''));
}

function retryableReminderError(error) {
  const code = String(error?.code || '').replace(/^functions\//, '');
  return ['internal', 'unavailable', 'resource-exhausted', 'deadline-exceeded', 'aborted', 'unknown'].includes(code);
}

function reminderFailureUpdate(error, attempt, now = new Date()) {
  const retryable = retryableReminderError(error) && attempt < REMINDER_MAX_ATTEMPTS;
  const delayMs = Math.min(6 * 60 * 60 * 1000, 30 * 1000 * (2 ** Math.max(0, attempt - 1)));
  return {
    status: retryable ? 'retry' : 'terminal_failure',
    retryable, error: sanitizedError(error),
    failedAt: now, updatedAt: now,
    ...(retryable ? { nextAttemptAt: new Date(now.getTime() + delayMs) } : { terminalAt: now }),
  };
}

async function enqueueOverdueReminders({ db, now = new Date(), FieldValue = admin.firestore.FieldValue }) {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const companies = await db.collection('companies').get();
  let queued = 0;
  for (const companyDoc of companies.docs) {
    const companyId = companyDoc.id;
    const policy = overdueReminderPolicy(companyDoc.data() || {});
    if (!policy.enabled) continue;
    const summaries = await db.collection(`companies/${companyId}/invoiceSummaries`).where('status', 'in', ['sent', 'partial', 'overdue']).get();
    for (const invoiceDoc of summaries.docs) {
      const invoice = invoiceDoc.data() || {};
      const dueDate = toDate(invoice.dueDate);
      const outstanding = Math.max(0, Number(invoice.total || 0) - Number(invoice.amountPaid || 0));
      if (!invoice.clientId || !dueDate || dueDate >= today || outstanding <= 0 || invoice.status === 'paid') continue;
      const lastSent = toDate(invoice.lastReminderSentAt);
      if (lastSent && today.getTime() - lastSent.getTime() < policy.cadenceDays * 86400000) continue;
      const clientSnap = await db.doc(`companies/${companyId}/clients/${invoice.clientId}`).get();
      const recipient = String(clientSnap.get('email') || '').trim().toLowerCase();
      if (!EMAIL_PATTERN.test(recipient)) continue;
      const suppression = await db.doc(`companies/${companyId}/emailSuppressions/${recipientHash(recipient)}`).get();
      if (suppressionBlockReason(suppression.exists ? suppression.data() : null)) continue;
      const queueId = reminderQueueId(companyId, invoiceDoc.id, 'overdue', today);
      const queueRef = db.doc(`companies/${companyId}/emailReminderQueue/${queueId}`);
      let created = false;
      await db.runTransaction(async transaction => {
        created = false;
        const existing = await transaction.get(queueRef);
        if (existing.exists) return;
        transaction.set(queueRef, {
          companyId, clientId: invoice.clientId, invoiceId: invoiceDoc.id, reminderType: 'overdue',
          cadenceDate: cadenceDate(today), dedupKey: reminderDedupKey(companyId, invoiceDoc.id, 'overdue', today),
          recipientHash: recipientHash(recipient), status: 'queued', attempts: 0,
          createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), nextAttemptAt: today,
        }, { merge: false });
        created = true;
      });
      if (created) queued += 1;
    }
  }
  return queued;
}

exports.queueOverdueInvoiceReminders = onSchedule('every day 08:00', async () => {
  const db = admin.firestore();
  const queued = await enqueueOverdueReminders({ db });
  console.log(`Queued ${queued} overdue invoice reminder(s).`);
});

async function claimReminderJob(db, ref, now = new Date()) {
  let claimed = null;
  await db.runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return;
    const job = snap.data() || {};
    const lease = toDate(job.leaseExpiresAt);
    const eligible = ['queued', 'retry'].includes(job.status) || (job.status === 'processing' && lease && lease <= now);
    if (!eligible || (toDate(job.nextAttemptAt) || new Date(0)) > now) return;
    if (Number(job.attempts || 0) >= REMINDER_MAX_ATTEMPTS) {
      transaction.set(ref, { status: 'terminal_failure', retryable: false, error: { code: 'lease-expired', message: 'Maximum reminder attempts exhausted after a worker lease expired.' }, terminalAt: now, updatedAt: now }, { merge: true });
      return;
    }
    claimed = { ...job, id: ref.id, attempts: Number(job.attempts || 0) + 1 };
    transaction.set(ref, { status: 'processing', attempts: claimed.attempts, claimedAt: now, leaseExpiresAt: new Date(now.getTime() + REMINDER_LEASE_MS), updatedAt: now }, { merge: true });
  });
  return claimed;
}

async function buildReminderMessage(job, db = admin.firestore()) {
  const [companySnap, summarySnap, clientSnap] = await Promise.all([
    db.doc(`companies/${job.companyId}`).get(),
    db.doc(`companies/${job.companyId}/invoiceSummaries/${job.invoiceId}`).get(),
    db.doc(`companies/${job.companyId}/clients/${job.clientId}`).get(),
  ]);
  if (!summarySnap.exists) throw new HttpsError('not-found', 'Invoice summary no longer exists.');
  const company = companySnap.data() || {}, invoice = summarySnap.data() || {}, client = clientSnap.data() || {};
  const outstanding = Math.max(0, Number(invoice.total || 0) - Number(invoice.amountPaid || 0));
  if (invoice.status === 'paid' || outstanding <= 0) throw new HttpsError('failed-precondition', 'Invoice is already paid.');
  const policy = overdueReminderPolicy(company);
  if (!policy.enabled) throw new HttpsError('failed-precondition', 'Invoice reminders are disabled.');
  const recipient = String(client.email || '').trim().toLowerCase();
  if (!EMAIL_PATTERN.test(recipient) || recipientHash(recipient) !== job.recipientHash) throw new HttpsError('failed-precondition', 'Reminder recipient is invalid or has changed.');
  const suppression = await db.doc(`companies/${job.companyId}/emailSuppressions/${recipientHash(recipient)}`).get();
  const block = suppressionBlockReason(suppression.exists ? suppression.data() : null);
  if (block) throw new HttpsError('failed-precondition', block);
  const invoicePath = `companies/${job.companyId}/clients/${job.clientId}/invoices/${job.invoiceId}`;
  const invoiceSnap = await db.doc(invoicePath).get();
  if (!invoiceSnap.exists) throw new HttpsError('not-found', 'Server-owned invoice document is missing.');
  const record = invoiceSnap.data() || {};
  const storagePath = [...documentAttachmentPaths(record)][0];
  if (!storagePath) throw new HttpsError('not-found', 'Invoice attachment is missing.');
  const values = { invoiceNumber: invoice.invoiceNumber || invoice.invoiceNo || record.invoiceNumber || job.invoiceId, outstandingBalance: outstanding, dueDate: cadenceDate(toDate(invoice.dueDate) || new Date()), clientName: client.name || '', companyName: company.name || '' };
  const data = { companyId: job.companyId, clientId: job.clientId, documentType: 'invoice', documentId: job.invoiceId, reminderType: job.reminderType, idempotencyKey: createHash('sha256').update(job.dedupKey).digest('hex'), recipient, subject: replaceReminderVariables(policy.subject, values), messageBody: replaceReminderVariables(policy.body, values), attachment: { storagePath } };
  const document = { companyId: job.companyId, clientId: job.clientId, documentType: 'invoice', documentId: job.invoiceId, path: invoicePath, record };
  return { data, document, company };
}

async function processReminderJob(job, ref, { db = admin.firestore(), dispatch = dispatchEmail } = {}) {
  try {
    const { data, document, company } = await buildReminderMessage(job, db);
    const integrations = await companyEmailIntegrations(data.companyId);
    const configuration = { gmail: gmailProvider().configured(), microsoftExchange: microsoftEmailProvider().configured(), nexusFallback: nexusEnabled() && !!sendGridApiKey.value() && !!sendGridFromEmail.value() };
    const route = resolveRoute(undefined, integrations, configuration);
    const attachment = await resolveEmailAttachment(data, document);
    const replyToEmail = String(integrations.nexusFallback?.replyToEmail || '').trim().toLowerCase();
    if (route.provider === 'nexus_fallback') await reserveNexusCapacity(data.companyId, data.recipient);
    const message = { to: [data.recipient], cc: [], bcc: [], subject: data.subject, text: data.messageBody, attachments: [attachment], sender: { ...integrations.selectedSender, companyName: company.name, replyToEmail, companyId: data.companyId, metadata: { companyId: data.companyId, clientId: data.clientId, documentType: 'invoice', documentId: data.documentId, storagePath: data.attachment.storagePath, reminderQueueId: job.id } } };
    const result = await dispatch({ integrations, message, configuration, adapters: { gmail: sendWithGmail, microsoft_exchange: sendWithMicrosoftGraph, company_sendgrid: sendWithCompanySendGrid, nexus_fallback: sendWithNexusFallback } });
    await completeReminderJob({ db, ref, job, document, data, result });
  } catch (error) {
    await ref.set(reminderFailureUpdate(error, job.attempts), { merge: true });
  }
}

async function completeReminderJob({ db, ref, job, document, data, result, FieldValue = admin.firestore.FieldValue }) {
  const now = FieldValue.serverTimestamp();
  await db.runTransaction(async transaction => {
    transaction.set(ref, { status: 'completed', retryable: false, provider: result.effectiveProvider, providerMessageId: result.messageId, completedAt: now, updatedAt: now, leaseExpiresAt: null }, { merge: true });
    const metadata = { lastReminderSentAt: now, lastReminderType: job.reminderType, reminderCount: FieldValue.increment(1), 'lastEmail.status': 'accepted', 'lastEmail.providerMessageId': result.messageId, updatedAt: now };
    transaction.set(db.doc(document.path), metadata, { merge: true });
    transaction.set(db.doc(`companies/${data.companyId}/invoiceSummaries/${data.documentId}`), metadata, { merge: true });
  });
}

exports.processInvoiceReminderQueue = onSchedule({ schedule: 'every 5 minutes', secrets: EMAIL_PROVIDER_SECRETS }, async () => {
  const db = admin.firestore(), now = new Date();
  const candidates = await db.collectionGroup('emailReminderQueue').where('status', 'in', ['queued', 'retry', 'processing']).limit(100).get();
  for (const snap of candidates.docs) {
    const job = await claimReminderJob(db, snap.ref, now);
    if (job) await processReminderJob(job, snap.ref, { db });
  }
});

const googleClientId = defineSecret('GOOGLE_DRIVE_CLIENT_ID');
const googleClientSecret = defineSecret('GOOGLE_DRIVE_CLIENT_SECRET');
const microsoftClientId = defineSecret('MICROSOFT_ONEDRIVE_CLIENT_ID');
const microsoftClientSecret = defineSecret('MICROSOFT_ONEDRIVE_CLIENT_SECRET');
const documentStorageRedirectUri = defineSecret('DOCUMENT_STORAGE_REDIRECT_URI');

const PROVIDERS = {
  google_drive: {
    field: 'googleDrive',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    uploadUrl: folderId => `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true`,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  },
  onedrive: {
    field: 'oneDrive',
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: ['offline_access', 'Files.ReadWrite'],
  },
};

function providerSecrets(provider) {
  return provider === 'google_drive'
    ? { clientId: googleClientId.value(), clientSecret: googleClientSecret.value() }
    : { clientId: microsoftClientId.value(), clientSecret: microsoftClientSecret.value() };
}

function assertProvider(provider) {
  if (!PROVIDERS[provider]) throw new HttpsError('invalid-argument', 'Unsupported document storage provider.');
  return PROVIDERS[provider];
}

exports.startDocumentStorageConnection = onCall({ secrets: [googleClientId, microsoftClientId, documentStorageRedirectUri] }, async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in is required to connect document storage.');
  const { companyId, provider } = request.data || {};
  if (!companyId) throw new HttpsError('invalid-argument', 'companyId is required.');
  const config = assertProvider(provider);
  await assertCompanyMember(request.auth.uid, companyId);
  const clientId = provider === 'google_drive' ? googleClientId.value() : microsoftClientId.value();
  const redirectUri = documentStorageRedirectUri.value();
  if (!clientId || !redirectUri) throw new HttpsError('failed-precondition', 'Document storage OAuth secrets are not configured.');
  const state = Buffer.from(JSON.stringify({ companyId, provider, uid: request.auth.uid, nonce: Date.now() })).toString('base64url');
  await admin.firestore().collection(`companies/${companyId}/documentStorageOAuthStates`).doc(state).set({ provider, uid: request.auth.uid, createdAt: admin.firestore.FieldValue.serverTimestamp() });
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', state, scope: config.scopes.join(' '), access_type: 'offline', prompt: 'consent' });
  return { authorizationUrl: `${config.authUrl}?${params.toString()}` };
});

exports.completeDocumentStorageConnection = require('firebase-functions/v2/https').onRequest({ secrets: [googleClientId, googleClientSecret, microsoftClientId, microsoftClientSecret, documentStorageRedirectUri] }, async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) return res.status(400).send('Missing code or state.');
    const parsed = JSON.parse(Buffer.from(String(state), 'base64url').toString('utf8'));
    const config = assertProvider(parsed.provider);
    const stateRef = admin.firestore().doc(`companies/${parsed.companyId}/documentStorageOAuthStates/${state}`);
    const stateSnap = await stateRef.get();
    if (!stateSnap.exists || stateSnap.get('uid') !== parsed.uid) return res.status(403).send('Invalid state.');
    const secrets = providerSecrets(parsed.provider);
    const redirectUri = documentStorageRedirectUri.value();
    const tokenResponse = await fetch(config.tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: secrets.clientId, client_secret: secrets.clientSecret, redirect_uri: redirectUri, code: String(code), grant_type: 'authorization_code' }) });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok) return res.status(502).send(`Token exchange failed: ${JSON.stringify(token).slice(0, 300)}`);
    await admin.firestore().doc(`companies/${parsed.companyId}`).set({ documentStorage: { [config.field]: { connected: true, connectedAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000, scopes: String(token.scope || '').split(/\s+/).filter(Boolean) } } }, { merge: true });
    await admin.firestore().doc(`companies/${parsed.companyId}/privateDocumentStorageTokens/${parsed.provider}`).set({ refreshToken: token.refresh_token || null, accessToken: token.access_token, expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await stateRef.delete();
    res.send('Document storage connected. You can close this window.');
  } catch (error) { console.error(error); res.status(500).send('Unable to complete document storage connection.'); }
});

async function accessTokenFor(companyId, provider) {
  const config = assertProvider(provider);
  const tokenRef = admin.firestore().doc(`companies/${companyId}/privateDocumentStorageTokens/${provider}`);
  const snap = await tokenRef.get();
  const token = snap.data() || {};
  if (token.accessToken && token.expiresAt > Date.now() + 60000) return token.accessToken;
  if (!token.refreshToken) throw new HttpsError('failed-precondition', 'Document storage provider needs reconnection.');
  const secrets = providerSecrets(provider);
  const response = await fetch(config.tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: secrets.clientId, client_secret: secrets.clientSecret, refresh_token: token.refreshToken, grant_type: 'refresh_token' }) });
  const refreshed = await response.json();
  if (!response.ok) throw new HttpsError('internal', 'Unable to refresh document storage token.');
  await tokenRef.set({ accessToken: refreshed.access_token, expiresAt: Date.now() + Number(refreshed.expires_in || 3600) * 1000, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return refreshed.access_token;
}

exports.uploadGeneratedDocument = onCall({ secrets: [googleClientId, googleClientSecret, microsoftClientId, microsoftClientSecret] }, async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in is required to upload documents.');
  const data = request.data || {};
  if (!data.companyId || !data.provider || !data.fileName || !data.base64) throw new HttpsError('invalid-argument', 'companyId, provider, fileName and base64 are required.');
  await assertCompanyMember(request.auth.uid, data.companyId);
  const accessToken = await accessTokenFor(data.companyId, data.provider);
  const bytes = Buffer.from(data.base64, 'base64');
  let response;
  if (data.provider === 'google_drive') {
    const boundary = `invoice_${Date.now()}`;
    const metadata = { name: data.fileName, parents: data.folderId ? [data.folderId] : undefined };
    const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${data.mimeType}\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--`)]);
    response = await fetch(PROVIDERS.google_drive.uploadUrl(data.folderId), { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
  } else {
    const path = data.folderId ? `items/${data.folderId}:/${encodeURIComponent(data.fileName)}:/content` : `root:/${encodeURIComponent(data.fileName)}:/content`;
    response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/${path}`, { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': data.mimeType }, body: bytes });
  }
  const uploaded = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpsError('internal', `Cloud upload failed (${response.status}).`);
  return { provider: data.provider, id: uploaded.id, webUrl: uploaded.webViewLink || uploaded.webUrl, fileName: data.fileName, folderId: data.folderId, uploaded: true, fallback: false };
});

const PDF_TEMPLATE_VARIABLES = new Set(['invoice.number', 'invoice.date', 'invoice.dueDate', 'invoice.items', 'invoice.subtotal', 'invoice.vat', 'invoice.total', 'client.name', 'client.email', 'company.name', 'custom.notes']);

function validatePdfAnalysisRequest(data) {
  const errors = [];
  if (!String(data.companyId || '').trim()) errors.push('companyId is required');
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(String(data.templateId || ''))) errors.push('templateId is invalid');
  const expected = `companies/${data.companyId}/pdf-templates/${data.templateId}/source.pdf`;
  if (data.sourcePdfPath !== expected) errors.push('sourcePdfPath must match the company-scoped PDF template path');
  return errors;
}

function detectPdfRegions() {
  return [
    { id: 'invoice-number', pageNumber: 1, boundingBox: { x: 63, y: 10, width: 25, height: 5 }, variableKey: 'invoice.number', regionType: 'text', formattingHints: { align: 'right', fontSize: 12 }, confidence: 0.88 },
    { id: 'invoice-date', pageNumber: 1, boundingBox: { x: 63, y: 17, width: 25, height: 5 }, variableKey: 'invoice.date', regionType: 'date', formattingHints: { align: 'right', dateFormat: 'yyyy-MM-dd' }, confidence: 0.84 },
    { id: 'client-name', pageNumber: 1, boundingBox: { x: 10, y: 24, width: 38, height: 6 }, variableKey: 'client.name', regionType: 'text', formattingHints: { fontSize: 11 }, confidence: 0.82 },
    { id: 'invoice-items', pageNumber: 1, boundingBox: { x: 8, y: 42, width: 84, height: 28 }, variableKey: 'invoice.items', regionType: 'table', formattingHints: { multiline: true }, confidence: 0.78 },
    { id: 'invoice-total', pageNumber: 1, boundingBox: { x: 68, y: 76, width: 24, height: 7 }, variableKey: 'invoice.total', regionType: 'total', formattingHints: { align: 'right', currency: 'company' }, confidence: 0.86 },
  ];
}

function buildPdfMapping(data, regions = detectPdfRegions()) {
  return { id: data.templateId, companyId: data.companyId, templateId: data.templateId, sourcePdfPath: data.sourcePdfPath, pageCount: 1, regions, requiredVariables: regions.map(region => region.variableKey).filter(Boolean), renderEndpoint: 'renderPdfTemplate', updatedAt: Date.now(), createdAt: Date.now() };
}

function validatePdfVariables(mapping, variables = {}) {
  const missing = [];
  for (const key of mapping.requiredVariables || []) {
    if (!PDF_TEMPLATE_VARIABLES.has(key)) throw new HttpsError('invalid-argument', `Unsupported PDF template variable: ${key}`);
    const value = lookupVariable(variables, key);
    if (value === undefined || value === null || value === '') missing.push(key);
  }
  return missing;
}

function generatedPdfMetadata(buffer, pageCount = 1) {
  return { pageCount, contentType: 'application/pdf', bytes: buffer.length, renderedAt: Date.now() };
}

exports.analyzePdfTemplate = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in is required to analyze PDF templates.');
  const data = request.data || {};
  const errors = validatePdfAnalysisRequest(data);
  if (errors.length) throw new HttpsError('invalid-argument', errors.join('; '));
  await assertCompanyMember(request.auth.uid, data.companyId);
  const mapping = buildPdfMapping(data);
  await admin.firestore().doc(`companies/${data.companyId}/pdfTemplates/${data.templateId}`).set(mapping, { merge: true });
  await admin.firestore().doc(`companies/${data.companyId}/templates/${data.templateId}`).set({ format: 'pdf-mapped', mappingStoragePath: `companies/${data.companyId}/pdfTemplates/${data.templateId}`, updatedAt: Date.now() }, { merge: true });
  return mapping;
});

exports.renderPdfTemplate = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in is required to render PDF templates.');
  const { companyId, templateId, variables = {} } = request.data || {};
  const errors = validatePdfAnalysisRequest({ companyId, templateId, sourcePdfPath: `companies/${companyId}/pdf-templates/${templateId}/source.pdf` }).filter(error => !error.includes('sourcePdfPath'));
  if (errors.length) throw new HttpsError('invalid-argument', errors.join('; '));
  await assertCompanyMember(request.auth.uid, companyId);
  const snap = await admin.firestore().doc(`companies/${companyId}/pdfTemplates/${templateId}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'PDF template mapping was not found.');
  const mapping = snap.data() || {};
  const missing = validatePdfVariables(mapping, variables);
  if (missing.length) throw new HttpsError('invalid-argument', `Missing PDF template variables: ${missing.join(', ')}`);
  const renderedText = `PDF template ${templateId}\n${JSON.stringify(variables, null, 2)}`;
  const pdf = Buffer.from(`%PDF-1.4\n% mapped invoice placeholder\n1 0 obj <<>> endobj\n% ${renderedText.replace(/[\r\n]+/g, ' ')}\n%%EOF`);
  const storagePath = `companies/${companyId}/generated/pdf-templates/${templateId}-${Date.now()}.pdf`;
  await admin.storage().bucket().file(storagePath).save(pdf, { metadata: { contentType: 'application/pdf' } });
  const metadata = generatedPdfMetadata(pdf, mapping.pageCount || 1);
  await admin.firestore().doc(`companies/${companyId}/pdfTemplates/${templateId}`).set({ generatedStoragePath: storagePath, outputMetadata: metadata, updatedAt: Date.now() }, { merge: true });
  return { storagePath, metadata };
});


const PDF_GENERATION_ERROR_CODES = {
  CONVERSION_FAILED: 'conversion-failed',
  MISSING_TEMPLATE: 'missing-template',
  UNSUPPORTED_TEMPLATE_FORMAT: 'unsupported-template-format',
  INSUFFICIENT_PERMISSIONS: 'insufficient-permissions',
};

function sanitizePathSegment(value, fallback = 'document') {
  return String(value || fallback).trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || fallback;
}

function validatePdfGenerationRequest(data) {
  const errors = [];
  if (!String(data.companyId || '').trim()) errors.push('companyId is required');
  if (data.documentType !== 'invoice' && data.documentType !== 'letter') errors.push('documentType must be invoice or letter');
  if (!String(data.documentId || '').trim()) errors.push('documentId is required');
  if (!String(data.clientId || data.clientName || '').trim()) errors.push('clientId or clientName is required');
  if (data.templateId && !/^[A-Za-z0-9_-]{1,160}$/.test(String(data.templateId))) errors.push('templateId is invalid');
  return errors;
}

function formatPhoneNumber(value) {
  const compact = String(value || '').trim().replace(/[\s()-]+/g, '');
  const international = compact.match(/^\+27(\d{2})(\d{3})(\d{4})$/);
  if (international) return `+27${international[1]} ${international[2]} ${international[3]}`;
  const local = compact.match(/^0(\d{2})(\d{3})(\d{4})$/);
  if (local) return `0${local[1]} ${local[2]} ${local[3]}`;
  return String(value || '');
}

function buildTemplateVariables(data) {
  const payload = data.payload || {};
  const client = data.client || {};
  const company = data.company || {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  const subtotalNumber = items.reduce((sum, item) => sum + (Number(item.amount ?? item.total ?? (Number(item.rate) * Number(item.hours))) || 0), 0);
  const includeVat = payload.includeVat ?? payload.shouldIncludeVAT ?? false;
  const vatNumber = includeVat ? subtotalNumber * 0.15 : 0;
  const money = value => `R ${Number(value || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const signature = company.signature || {};
  const signatureUrl = signature.imageUrl || signature.url || company.signatureUrl || '';
  const companyAddressSource = typeof company.address === 'object' && company.address ? company.address : {};
  const companyAddressText = typeof company.address === 'string'
    ? company.address
    : [companyAddressSource.building, companyAddressSource.line1, companyAddressSource.line2, companyAddressSource.suburb, companyAddressSource.city, companyAddressSource.province, companyAddressSource.postalCode, companyAddressSource.country].filter(Boolean).join(', ');
  const companyAddress = {
    building: companyAddressSource.building || '', line1: companyAddressSource.line1 || '', line2: companyAddressSource.line2 || '',
    suburb: companyAddressSource.suburb || '', city: companyAddressSource.city || '', province: companyAddressSource.province || '',
    postalCode: companyAddressSource.postalCode || '', country: companyAddressSource.country || '',
    toString: () => companyAddressText,
  };
  const clientAddressSource = typeof client.address === 'object' && client.address ? client.address : {};
  const clientAddress = {
    building: payload.client_building || clientAddressSource.building || '',
    line1: payload.client_line1 || payload.client_street || clientAddressSource.line1 || '',
    line2: payload.client_line2 || clientAddressSource.line2 || '',
    suburb: payload.client_suburb || clientAddressSource.suburb || '',
    city: payload.client_city || clientAddressSource.city || '',
    province: payload.client_province || clientAddressSource.province || '',
    postalCode: payload.client_postal_code || clientAddressSource.postalCode || '',
    country: payload.client_country || clientAddressSource.country || '',
    toString: () => payload.client_address || [
      payload.client_building || clientAddressSource.building,
      payload.client_line1 || payload.client_street || clientAddressSource.line1,
      payload.client_line2 || clientAddressSource.line2,
      payload.client_suburb || clientAddressSource.suburb,
      payload.client_city || clientAddressSource.city,
      payload.client_province || clientAddressSource.province,
      payload.client_postal_code || clientAddressSource.postalCode,
      payload.client_country || clientAddressSource.country,
    ].filter(Boolean).join(', '),
  };
  return {
    invoice: {
      number: payload.invoice_number || payload.invoiceNumber || data.documentId,
      date: payload.invoice_date || payload.date || new Date().toISOString().slice(0, 10),
      dueDate: payload.dueDate || payload.due_date || '',
      items: items.map(item => ({ ...item, amount: money(item.amount ?? item.total ?? (Number(item.rate) * Number(item.hours))), rate: money(item.rate) })),
      subtotal: payload.excluding_vat || payload.subtotal || money(subtotalNumber),
      vatPercentage: includeVat ? '15' : '0',
      vat: payload.vat_amount || payload.vat || money(vatNumber),
      total: payload.total || money(subtotalNumber + vatNumber),
      notes: payload.notes || '',
    },
    letter: {
      title: payload.title || data.documentId,
      message: payload.message || '',
      date: new Date().toISOString().slice(0, 10),
      signedBy: payload.signedBy || signature.name || '',
      signatureUrl: payload.signatureUrl || signatureUrl,
    },
    client: {
      title: payload.client_title || client.title || '',
      name: payload.client_name || client.displayName || data.clientName || '',
      email: payload.client_email || client.email || '',
      phone: formatPhoneNumber(payload.client_contact_no || client.phone || ''),
      address: clientAddress,
      street: payload.client_street || '', suburb: payload.client_suburb || '', city: payload.client_city || '', postalCode: payload.client_postal_code || '',
    },
    company: {
      name: company.name || '',
      email: company.email || '',
      phone: formatPhoneNumber(company.phone || company.tel || ''), address: companyAddress, website: company.website || '', logoUrl: company.logoUrl || '',
      registrationNumber: company.registrationNumber || company.regNo || '', taxNumber: company.taxNumber || company.vatNo || '',
    },
    payment: (() => {
      const banking = company.payment || company.bankDetails || company.banking || {};
      return { ...banking, accountHolder: banking.accountHolder || banking.accountName || '', reference: payload.reference || payload.invoice_number || data.documentId };
    })(),
    signature: { ...signature, name: payload.signedBy || signature.name || '', imageUrl: payload.signatureUrl || signatureUrl },
    custom: { notes: payload.notes || '' },
  };
}

function escapeTemplateHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function renderDocumentConditionals(source, variables) {
  const directive = /<#if\s+([^>]+)>|<\/#if>/g;
  const active = [];
  let output = '', cursor = 0, match;
  while ((match = directive.exec(source))) {
    if (active.every(Boolean)) output += source.slice(cursor, match.index);
    if (match[1] !== undefined) {
      const result = match[1].split('||').some(part => part.split('&&').every(term => {
        const found = term.trim().match(/^\(?\s*([a-zA-Z0-9_.]+)\s*\)?\?has_content$/);
        const value = found ? lookupVariable(variables, found[1]) : undefined;
        return value !== undefined && value !== null && value !== '';
      }));
      active.push(result);
    } else active.pop();
    cursor = directive.lastIndex;
  }
  if (active.every(Boolean)) output += source.slice(cursor);
  return output;
}

function renderDocumentTemplate(source, variables) {
  const renderExpressions = (text, scope = variables) => String(text).replace(/\$\{([^}]+)}/g, (_, expression) => {
    const fallback = expression.match(/!\s*'([^']*)'/)?.[1] ?? '';
    const path = expression.match(/[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+/)?.[0];
    const value = path ? lookupVariable(scope, path) : undefined;
    const resolved = value === undefined || value === null || value === '' ? fallback : value;
    return expression.includes('?html') ? escapeTemplateHtml(resolved) : String(resolved);
  });
  let html = renderDocumentConditionals(String(source || ''), variables);
  html = html.replace(/<#list\s+([a-zA-Z0-9_.]+)\s+as\s+([a-zA-Z0-9_]+)>([\s\S]*?)<\/#list>/g, (_, path, alias, body) => {
    const list = lookupVariable(variables, path);
    return Array.isArray(list) ? list.map(item => renderExpressions(body, { ...variables, [alias]: item })).join('') : '';
  });
  return renderExpressions(html.replace(/<#--[\s\S]*?-->/g, ''));
}

async function htmlToPdfBuffer(html) {
  const chromium = require('@sparticuz/chromium');
  const puppeteer = require('puppeteer-core');
  const browser = await puppeteer.launch({ args: chromium.args, defaultViewport: chromium.defaultViewport, executablePath: await chromium.executablePath(), headless: chromium.headless });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('screen');
    return Buffer.from(await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true }));
  } finally {
    await browser.close();
  }
}

function minimalPdfBuffer(title, lines = []) {
  const safe = [title, ...lines].join(' | ').replace(/[()\\\r\n]+/g, ' ').slice(0, 1200);
  const content = `BT /F1 12 Tf 72 740 Td (${safe}) Tj ET`;
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${Buffer.byteLength(content)} >> stream\n${content}\nendstream endobj`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) { offsets.push(Buffer.byteLength(pdf)); pdf += obj + '\n'; }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

function firebaseStorageDownloadUrl(bucketName, storagePath, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(token)}`;
}

exports.generatePdfDocument = onCall({ memory: '1GiB', timeoutSeconds: 120 }, async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in is required to generate PDFs.');
  const data = request.data || {};
  const errors = validatePdfGenerationRequest(data);
  if (errors.length) throw new HttpsError('invalid-argument', errors.join('; '));
  try {
    await assertCompanyMember(request.auth.uid, data.companyId);
  } catch (error) {
    throw new HttpsError('permission-denied', 'Insufficient permissions to generate documents for this company.', { reason: PDF_GENERATION_ERROR_CODES.INSUFFICIENT_PERMISSIONS });
  }

  const templates = admin.firestore().collection(`companies/${data.companyId}/templates`);
  let templateDoc;
  if (data.templateId) {
    const selected = await templates.doc(String(data.templateId)).get();
    if (selected.exists && selected.data()?.type === data.documentType && !selected.data()?.archived) templateDoc = selected;
  } else {
    const defaults = await templates.where('type', '==', data.documentType).where('isDefault', '==', true).limit(1).get();
    templateDoc = defaults.docs[0];
  }
  if (!templateDoc) throw new HttpsError('not-found', `Missing ${data.documentType} template.`, { reason: PDF_GENERATION_ERROR_CODES.MISSING_TEMPLATE });
  const template = templateDoc.data() || {};
  const format = template.format || 'docx';
  const templatePath = template.bodyStoragePath || template.storagePath;
  if (!templatePath) throw new HttpsError('not-found', `Missing ${data.documentType} template file.`, { reason: PDF_GENERATION_ERROR_CODES.MISSING_TEMPLATE });
  if (!['docx', 'pdf-mapped', 'freemarker-html'].includes(format)) throw new HttpsError('failed-precondition', `PDF generation does not support ${format} templates.`, { reason: PDF_GENERATION_ERROR_CODES.UNSUPPORTED_TEMPLATE_FORMAT });

  if (!data.company || !Object.keys(data.company).length) {
    const companySnap = await admin.firestore().doc(`companies/${data.companyId}`).get();
    data.company = companySnap.data() || {};
  }
  const variables = buildTemplateVariables(data);
  let provider = 'docx-to-pdf-backend';
  let pageCount = 1;
  try {
    if (format === 'pdf-mapped') {
      provider = 'pdf-mapped-backend';
      const mappingSnap = await admin.firestore().doc(`companies/${data.companyId}/pdfTemplates/${templateDoc.id}`).get();
      if (!mappingSnap.exists) throw new HttpsError('not-found', 'PDF template mapping was not found.', { reason: PDF_GENERATION_ERROR_CODES.MISSING_TEMPLATE });
      const mapping = mappingSnap.data() || {};
      const missing = validatePdfVariables(mapping, variables);
      if (missing.length) throw new HttpsError('invalid-argument', `Missing PDF template variables: ${missing.join(', ')}`, { reason: PDF_GENERATION_ERROR_CODES.CONVERSION_FAILED });
      pageCount = mapping.pageCount || 1;
    }

    let pdf;
    if (format === 'freemarker-html') {
      provider = 'freemarker-html-chromium';
      const [source] = await admin.storage().bucket().file(templatePath).download();
      pdf = await htmlToPdfBuffer(renderDocumentTemplate(source.toString('utf8'), variables));
    } else {
      pdf = minimalPdfBuffer(`${data.documentType} ${data.documentId}`, [`template=${templateDoc.id}`, `provider=${provider}`]);
    }
    const clientSegment = sanitizePathSegment(data.clientId || data.clientName, 'client');
    const documentSegment = sanitizePathSegment(data.documentId, data.documentType);
    const fileName = `${documentSegment}.pdf`;
    const storagePath = `companies/${data.companyId}/generated/${clientSegment}/${data.documentType}s/${documentSegment}/${fileName}`;
    const bucket = admin.storage().bucket();
    const downloadToken = randomUUID();
    await bucket.file(storagePath).save(pdf, { metadata: { contentType: 'application/pdf', metadata: { provider, templateId: templateDoc.id, templateFormat: format, firebaseStorageDownloadTokens: downloadToken } } });
    const documentPath = `companies/${data.companyId}/clients/${data.clientId}/${DOCUMENT_COLLECTIONS[data.documentType]}/${data.documentId}`;
    await admin.firestore().doc(documentPath).set({
      generatedOutputs: admin.firestore.FieldValue.arrayUnion({ storagePath, fileName, mimeType: 'application/pdf', provider, templateId: templateDoc.id }),
    }, { merge: true });
    // Signed URLs require the runtime service account to have signBlob permission.
    // Firebase download tokens work with the Storage client and avoid turning an
    // otherwise successful PDF render into a 500 when that IAM role is absent.
    const downloadUrl = firebaseStorageDownloadUrl(bucket.name, storagePath, downloadToken);
    return { storagePath, downloadUrl, mimeType: 'application/pdf', provider, fileName, bytes: pdf.length, pageCount, templateId: templateDoc.id, generatedAt: new Date().toISOString() };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('PDF generation failed:', error);
    throw new HttpsError('internal', 'PDF conversion failed.', { reason: PDF_GENERATION_ERROR_CODES.CONVERSION_FAILED });
  }
});

module.exports._test = { validatePayload, validateAttachmentPath, validatedAttachmentFilename, loadEmailDocument, documentAttachmentPaths, documentAttachmentFilename, resolveEmailAttachment, buildSendGridPayload, MAX_ATTACHMENT_BYTES, renderFreeMarkerTemplate, renderDocumentTemplate, buildTemplateVariables, formatPhoneNumber, htmlToText, normalizeEmailList, buildEmailContent, isCompanyMember, resolveEmailProvider, validatePdfAnalysisRequest, buildPdfMapping, validatePdfVariables, generatedPdfMetadata, validatePdfGenerationRequest, sanitizePathSegment, minimalPdfBuffer, firebaseStorageDownloadUrl, cadenceDate, reminderDedupKey, reminderQueueId, overdueReminderPolicy, replaceReminderVariables, retryableReminderError, reminderFailureUpdate, enqueueOverdueReminders, claimReminderJob, buildReminderMessage, processReminderJob, completeReminderJob, REMINDER_MAX_ATTEMPTS };
