const test = require('node:test');
const assert = require('node:assert/strict');
const { createGmailProvider, buildMimeMessage, SEND_SCOPE } = require('./email/providers/gmail');
const { _test } = require('./index');

function fakeDb() {
  const values = new Map();
  const ref = path => ({
    path,
    async set(value, options) { values.set(path, options?.merge ? { ...(values.get(path) || {}), ...value } : value); },
    async get() { return { exists: values.has(path), data: () => values.get(path) }; },
    async delete() { values.delete(path); },
  });
  return {
    values, doc: ref,
    async runTransaction(work) {
      return work({ get: target => target.get(), delete: target => target.delete() });
    },
  };
}

function response(status, body) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }
const config = db => ({ db, clientId: () => 'gmail-client', clientSecret: () => 'gmail-secret', redirectUri: () => 'https://example.test/gmail/callback', now: () => 1_000_000 });

test('state is short-lived, provider-bound, single use and bound to uid/company', async () => {
  const db = fakeDb();
  const gmail = createGmailProvider({ ...config(db), fetchImpl: async () => response(200, {}) });
  const url = new URL(await gmail.start({ uid: 'u1', companyId: 'c1', requestedMailbox: 'me@example.com' }));
  assert.equal(url.searchParams.get('scope'), SEND_SCOPE);
  assert.equal(url.searchParams.get('access_type'), 'offline');
  const state = url.searchParams.get('state');
  const bound = await gmail.consumeState(state);
  assert.deepEqual([bound.uid, bound.companyId, bound.provider], ['u1', 'c1', 'gmail']);
  await assert.rejects(gmail.consumeState(state), /invalid_state/);
});

test('expired and wrong-provider states are rejected', async () => {
  const db = fakeDb();
  const gmail = createGmailProvider(config(db));
  const url = new URL(await gmail.start({ uid: 'u1', companyId: 'c1' }));
  const entry = [...db.values.entries()].find(([key]) => key.startsWith('emailOAuthStates/'));
  entry[1].provider = 'drive';
  await assert.rejects(gmail.consumeState(url.searchParams.get('state')), /invalid_state/);
});

test('membership predicate denies unrelated users', () => {
  assert.equal(_test.isCompanyMember('u1', 'c1', 'other', []), false);
  assert.equal(_test.isCompanyMember('u1', 'c1', 'other', ['u1']), true);
});

test('refreshes an expired access token', async () => {
  const db = fakeDb();
  await db.doc('companies/c1/privateEmailTokens/gmail').set({ refreshToken: 'refresh', accessToken: 'old', accessTokenExpiresAt: new Date(1), accountEmail: 'me@example.com' });
  const gmail = createGmailProvider({ ...config(db), fetchImpl: async () => response(200, { access_token: 'fresh', expires_in: 3600 }) });
  assert.equal((await gmail.accessToken('c1')).token, 'fresh');
});

test('revoked consent marks the connection unhealthy', async () => {
  const db = fakeDb();
  await db.doc('companies/c1/privateEmailTokens/gmail').set({ refreshToken: 'revoked', accessTokenExpiresAt: new Date(1), accountEmail: 'me@example.com' });
  const gmail = createGmailProvider({ ...config(db), fetchImpl: async () => response(400, { error: 'invalid_grant' }) });
  await assert.rejects(gmail.accessToken('c1'), /revoked_consent/);
  assert.equal(db.values.get('companies/c1/emailIntegration/status').gmail.connected, false);
});

test('OAuth callback rejects a mailbox different from the requested identity', async () => {
  const db = fakeDb();
  let call = 0;
  const gmail = createGmailProvider({ ...config(db), fetchImpl: async () => ++call === 1
    ? response(200, { access_token: 'access', refresh_token: 'refresh' })
    : response(200, { emailAddress: 'other@example.com' }) });
  const url = new URL(await gmail.start({ uid: 'u1', companyId: 'c1', requestedMailbox: 'me@example.com' }));
  await assert.rejects(gmail.callback({ state: url.searchParams.get('state'), code: 'code' }), /mailbox_mismatch/);
  assert.equal(db.values.has('companies/c1/privateEmailTokens/gmail'), false);
});

test('constructs multipart MIME with copies, alternatives, and attachment', () => {
  const mime = buildMimeMessage({ from: 'me@example.com', to: ['to@example.com'], cc: ['cc@example.com'], bcc: ['bcc@example.com'], subject: 'Invoice', text: 'plain', html: '<b>html</b>', attachments: [{ filename: 'invoice.pdf', type: 'application/pdf', content: Buffer.from('PDF').toString('base64') }] });
  for (const expected of ['To: to@example.com', 'Cc: cc@example.com', 'Bcc: bcc@example.com', 'multipart/alternative', 'multipart/mixed', 'filename="invoice.pdf"']) assert.match(mime, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('routes explicit and configured Gmail providers successfully', () => {
  assert.equal(_test.resolveEmailProvider('gmail', 'sendgrid'), 'gmail');
  assert.equal(_test.resolveEmailProvider(undefined, 'gmail'), 'gmail');
});
