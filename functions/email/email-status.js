const { createHash, createPublicKey, verify } = require('crypto');

const PROVIDER_STATUSES = Object.freeze([
  'pending', 'sent', 'accepted', 'deferred', 'delivered', 'dropped', 'bounced',
  'complained', 'unsubscribed', 'failed',
]);

const EVENT_STATUS = Object.freeze({
  processed: 'accepted', delivered: 'delivered', deferred: 'deferred',
  dropped: 'dropped', bounce: 'bounced', spamreport: 'complained',
  unsubscribe: 'unsubscribed', group_unsubscribe: 'unsubscribed',
});

const STATUS_PRIORITY = Object.freeze({
  pending: 0, sent: 10, accepted: 20, deferred: 30, delivered: 40,
  dropped: 50, bounced: 60, complained: 70, unsubscribed: 80, failed: 50,
});

function publicKeyFrom(value) {
  const key = String(value || '').trim().replace(/\\n/g, '\n');
  if (!key) throw new Error('SendGrid webhook public key is not configured');
  if (key.includes('BEGIN PUBLIC KEY')) return createPublicKey(key);
  return createPublicKey({ key: Buffer.from(key, 'base64'), format: 'der', type: 'spki' });
}

function verifySendGridSignature({ publicKey, signature, timestamp, rawBody }) {
  if (!signature || !timestamp || !Buffer.isBuffer(rawBody)) return false;
  try {
    return verify('sha256', Buffer.concat([Buffer.from(String(timestamp)), rawBody]),
      publicKeyFrom(publicKey), Buffer.from(String(signature), 'base64'));
  } catch (_) {
    return false;
  }
}

function cleanReason(event, status) {
  const raw = event.reason || event.response || event.status || event.bounce_classification;
  if (!raw && status === 'complained') return 'Recipient reported this message as spam.';
  if (!raw && status === 'unsubscribed') return 'Recipient unsubscribed from email.';
  return raw ? String(raw).replace(/[\r\n]+/g, ' ').slice(0, 300) : null;
}

function normalizeSendGridEvent(event) {
  const providerEvent = String(event?.event || '').toLowerCase();
  const status = EVENT_STATUS[providerEvent];
  if (!status) return null;
  const timestamp = Number(event.timestamp);
  const providerMessageId = String(event.sg_message_id || '').split('.')[0] || null;
  const sendRecordId = String(event.sendRecordId || event.send_record_id || '');
  const companyId = String(event.companyId || event.company_id || '');
  const email = String(event.email || '').trim().toLowerCase();
  const eventId = String(event.sg_event_id || '') || createHash('sha256')
    .update(JSON.stringify([providerEvent, timestamp, providerMessageId, sendRecordId, email])).digest('hex');
  return {
    eventId, providerEvent, status, providerMessageId,
    sendRecordId: /^[a-f0-9]{64}$/.test(sendRecordId) ? sendRecordId : null,
    companyId: /^[A-Za-z0-9_-]{1,128}$/.test(companyId) ? companyId : null,
    email, occurredAtSeconds: Number.isFinite(timestamp) ? timestamp : 0,
    failureReason: cleanReason(event, status),
    suppress: status === 'complained' || status === 'unsubscribed'
      || (status === 'bounced' && String(event.type || 'bounce').toLowerCase() !== 'blocked'),
  };
}

function eventUpdate(current, event) {
  if (!event || current?.processedEventIds?.includes(event.eventId)) return null;
  const previousSeconds = Number(current?.providerEventTimestamp || 0);
  const older = event.occurredAtSeconds < previousSeconds;
  const sameButWeaker = event.occurredAtSeconds === previousSeconds
    && (STATUS_PRIORITY[event.status] || 0) < (STATUS_PRIORITY[current?.status] || 0);
  if (older || sameButWeaker) return { duplicate: false, ignored: true };
  return {
    duplicate: false, ignored: false, status: event.status,
    providerEvent: event.providerEvent, providerEventId: event.eventId,
    providerEventTimestamp: event.occurredAtSeconds,
    failureReason: event.failureReason,
  };
}

function suppressionBlockReason(record) {
  if (!record || record.active === false) return null;
  const reason = String(record.reason || 'delivery policy');
  return `Email blocked: recipient is suppressed (${reason}).`;
}

module.exports = {
  PROVIDER_STATUSES, STATUS_PRIORITY, verifySendGridSignature,
  normalizeSendGridEvent, eventUpdate, suppressionBlockReason,
};
