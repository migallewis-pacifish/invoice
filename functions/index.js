const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');

admin.initializeApp();

const sendGridApiKey = defineSecret('SENDGRID_API_KEY');
const sendGridFromEmail = defineSecret('SENDGRID_FROM_EMAIL');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmailList(value) {
  if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean);
  return String(value || '').split(/[;,]/).map(v => v.trim()).filter(Boolean);
}

function validatePayload(data) {
  const errors = [];
  if (!data.companyId) errors.push('companyId is required');
  if (!data.clientId) errors.push('clientId is required');
  if (data.documentType !== 'invoice' && data.documentType !== 'letter') errors.push('documentType must be invoice or letter');
  if (!data.documentId) errors.push('documentId is required');
  if (!EMAIL_PATTERN.test(data.recipient || '')) errors.push('recipient email is invalid');
  for (const email of [...normalizeEmailList(data.cc), ...normalizeEmailList(data.bcc)]) {
    if (!EMAIL_PATTERN.test(email)) errors.push(`copy recipient is invalid: ${email}`);
  }
  if (!String(data.subject || '').trim()) errors.push('subject is required');
  if (!String(data.messageBody || '').trim() && data.templateSelection?.kind !== 'designed') errors.push('messageBody is required');
  if (data.templateSelection?.kind === 'designed' && !String(data.templateSelection.templateId || '').trim()) errors.push('templateSelection.templateId is required');
  if (!data.attachment?.storagePath && !data.attachment?.generatedDocumentPayloadRef) {
    errors.push('attachment.storagePath or attachment.generatedDocumentPayloadRef is required');
  }
  return errors;
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
}

const APPROVED_TEMPLATE_VARIABLES = new Set(['clientName', 'invoiceNumber', 'dueDate', 'total', 'companyName', 'paymentReference', 'outstandingBalance', 'daysOverdue', 'company.name', 'company.email', 'company.phone', 'company.address', 'client.name', 'client.email', 'invoice.number', 'invoice.date', 'invoice.dueDate', 'invoice.subtotal', 'invoice.vat', 'invoice.total', 'invoice.outstandingBalance', 'invoice.daysOverdue']);

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

async function sendWithSendGrid(data) {
  const apiKey = sendGridApiKey.value();
  const fromEmail = sendGridFromEmail.value();
  if (!apiKey || !fromEmail) {
    throw new HttpsError('failed-precondition', 'Email provider secrets are not configured.');
  }

  const content = await buildEmailContent(data);

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{
        to: [{ email: data.recipient }],
        cc: normalizeEmailList(data.cc).map(email => ({ email })),
        bcc: normalizeEmailList(data.bcc).map(email => ({ email })),
      }],
      from: { email: fromEmail },
      subject: data.subject,
      content,
      custom_args: {
        companyId: data.companyId,
        clientId: data.clientId,
        documentType: data.documentType,
        documentId: data.documentId,
        storagePath: data.attachment?.storagePath || '',
        generatedDocumentPayloadRef: data.attachment?.generatedDocumentPayloadRef || '',
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new HttpsError('internal', `SendGrid rejected the email (${response.status}): ${text.slice(0, 300)}`);
  }
  return response.headers.get('x-message-id') || `sendgrid-${Date.now()}`;
}

exports.sendDocumentEmail = onCall({ secrets: [sendGridApiKey, sendGridFromEmail] }, async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in is required to send email.');
  const data = request.data || {};
  const errors = validatePayload(data);
  if (errors.length) throw new HttpsError('invalid-argument', errors.join('; '));
  await assertCompanyMember(request.auth.uid, data.companyId);
  const messageId = await sendWithSendGrid(data);
  return { provider: 'sendgrid', messageId, accepted: true, sentAt: new Date().toISOString() };
});


function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

exports.queueOverdueInvoiceReminders = onSchedule('every day 08:00', async () => {
  const db = admin.firestore();
  const today = startOfToday();
  const companies = await db.collection('companies').get();
  let queued = 0;

  for (const companyDoc of companies.docs) {
    const companyId = companyDoc.id;
    const summaries = await db.collection(`companies/${companyId}/invoiceSummaries`)
      .where('status', 'in', ['sent', 'partial', 'overdue'])
      .get();

    for (const invoiceDoc of summaries.docs) {
      const invoice = invoiceDoc.data();
      const dueDate = toDate(invoice.dueDate);
      const outstanding = Math.max(0, Number(invoice.total || 0) - Number(invoice.amountPaid || 0));
      if (!invoice.clientId || !dueDate || dueDate >= today || outstanding <= 0) continue;

      const clientRef = db.doc(`companies/${companyId}/clients/${invoice.clientId}`);
      const clientSnap = await clientRef.get();
      const recipient = clientSnap.get('email');
      if (!EMAIL_PATTERN.test(recipient || '')) continue;

      await db.collection(`companies/${companyId}/emailReminderQueue`).add({
        companyId,
        clientId: invoice.clientId,
        invoiceId: invoiceDoc.id,
        reminderType: 'overdue',
        recipient,
        status: 'queued',
        queuedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      queued += 1;
    }
  }

  console.log(`Queued ${queued} overdue invoice reminder(s).`);
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

module.exports._test = { validatePayload, renderFreeMarkerTemplate, htmlToText, normalizeEmailList, buildEmailContent, isCompanyMember, validatePdfAnalysisRequest, buildPdfMapping, validatePdfVariables, generatedPdfMetadata };
