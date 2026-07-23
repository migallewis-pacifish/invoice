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
  if (!String(data.messageBody || '').trim()) errors.push('messageBody is required');
  if (!data.attachment?.storagePath && !data.attachment?.generatedDocumentPayloadRef) {
    errors.push('attachment.storagePath or attachment.generatedDocumentPayloadRef is required');
  }
  return errors;
}

async function assertCompanyMember(uid, companyId) {
  const [userSnap, companySnap] = await Promise.all([
    admin.firestore().doc(`users/${uid}`).get(),
    admin.firestore().doc(`companies/${companyId}`).get(),
  ]);
  const userCompanyId = userSnap.get('companyId');
  const users = companySnap.get('users') || [];
  if (userCompanyId !== companyId && !users.includes(uid)) {
    throw new HttpsError('permission-denied', 'You are not a member of this company.');
  }
}

async function sendWithSendGrid(data) {
  const apiKey = sendGridApiKey.value();
  const fromEmail = sendGridFromEmail.value();
  if (!apiKey || !fromEmail) {
    throw new HttpsError('failed-precondition', 'Email provider secrets are not configured.');
  }

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
      content: [{ type: 'text/plain', value: data.messageBody }],
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
