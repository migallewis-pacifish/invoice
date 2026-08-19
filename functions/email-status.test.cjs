const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, sign } = require('node:crypto');
const { verifySendGridSignature, normalizeSendGridEvent, eventUpdate, suppressionBlockReason } = require('./email/email-status');

function signedPayload(body) {
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const rawBody = Buffer.from(JSON.stringify(body));
  const timestamp = '1787097600';
  const signature = sign('sha256', Buffer.concat([Buffer.from(timestamp), rawBody]), keys.privateKey).toString('base64');
  return { publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }), rawBody, timestamp, signature };
}

test('rejects a modified SendGrid webhook signature', () => {
  const request = signedPayload([{ event: 'delivered' }]);
  assert.equal(verifySendGridSignature(request), true);
  assert.equal(verifySendGridSignature({ ...request, rawBody: Buffer.from('[{"event":"bounce"}]') }), false);
  assert.equal(verifySendGridSignature({ ...request, signature: 'invalid' }), false);
});

test('duplicate event delivery is idempotent', () => {
  const event = normalizeSendGridEvent({ event: 'delivered', timestamp: 20, sg_event_id: 'evt-1', companyId: 'acme', email: 'a@example.com' });
  assert.equal(eventUpdate({ status: 'delivered', processedEventIds: ['evt-1'] }, event), null);
});

test('older events cannot regress the latest status', () => {
  const deferred = normalizeSendGridEvent({ event: 'deferred', timestamp: 10, sg_event_id: 'old', companyId: 'acme', email: 'a@example.com' });
  assert.deepEqual(eventUpdate({ status: 'delivered', providerEventTimestamp: 20 }, deferred), { duplicate: false, ignored: true });
  const bounce = normalizeSendGridEvent({ event: 'bounce', timestamp: 30, sg_event_id: 'new', companyId: 'acme', email: 'a@example.com', reason: 'Mailbox does not exist' });
  assert.equal(eventUpdate({ status: 'delivered', providerEventTimestamp: 20 }, bounce).status, 'bounced');
});

test('unknown message IDs have no usable record locator', () => {
  const event = normalizeSendGridEvent({ event: 'dropped', timestamp: 10, companyId: 'acme', email: 'a@example.com' });
  assert.equal(event.sendRecordId, null);
  assert.equal(event.providerMessageId, null);
});

test('suppression enforcement blocks active records only', () => {
  assert.match(suppressionBlockReason({ active: true, reason: 'complained' }), /complained/);
  assert.equal(suppressionBlockReason({ active: false, reason: 'unsubscribed' }), null);
  assert.equal(suppressionBlockReason(null), null);
});

test('only hard bounce, complaint, and unsubscribe events suppress', () => {
  const base = { timestamp: 10, companyId: 'acme', email: 'a@example.com' };
  assert.equal(normalizeSendGridEvent({ ...base, event: 'bounce', type: 'bounce' }).suppress, true);
  assert.equal(normalizeSendGridEvent({ ...base, event: 'bounce', type: 'blocked' }).suppress, false);
  assert.equal(normalizeSendGridEvent({ ...base, event: 'spamreport' }).suppress, true);
  assert.equal(normalizeSendGridEvent({ ...base, event: 'unsubscribe' }).suppress, true);
  assert.equal(normalizeSendGridEvent({ ...base, event: 'dropped' }).suppress, false);
});
