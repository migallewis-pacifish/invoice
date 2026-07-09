const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
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
