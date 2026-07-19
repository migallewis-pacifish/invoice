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
