const test = require('node:test');
const assert = require('node:assert/strict');
const { createMicrosoftProvider, graphMessage, parseTenantPolicy, SCOPES } = require('./email/providers/microsoft');

class Snap { constructor(value) { this.value = value; this.exists = value !== undefined; } data() { return this.value; } get(key) { return this.value?.[key]; } }
class Db {
  constructor() { this.values = new Map(); }
  doc(path) { return { get: async () => new Snap(this.values.get(path)), set: async (value, options) => this.values.set(path, options?.merge ? deepMerge(this.values.get(path) || {}, value) : value), delete: async () => this.values.delete(path) }; }
  async runTransaction(fn) { return fn({ get: ref => ref.get(), delete: ref => ref.delete() }); }
}
const deepMerge = (left, right) => Object.fromEntries([...new Set([...Object.keys(left), ...Object.keys(right)])].map(key => [key, left[key] && right[key] && typeof left[key] === 'object' && typeof right[key] === 'object' && !(right[key] instanceof Date) ? deepMerge(left[key], right[key]) : (right[key] ?? left[key])]));
const response = (status, body = {}, headers = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body, headers: { get: key => headers[key.toLowerCase()] || null } });
const config = db => ({ db, clientId: () => 'client', clientSecret: () => 'secret', redirectUri: () => 'https://example.test/callback', allowedTenants: () => 'tenant-a,tenant-b', now: () => 1_000_000 });

test('tenant policy requires and validates an explicit allow list', () => {
  assert.deepEqual(parseTenantPolicy('tenant-a'), { mode: 'single_tenant', tenants: ['tenant-a'] });
  const provider = createMicrosoftProvider(config(new Db()));
  assert.equal(provider.validateTenant('TENANT-A'), 'tenant-a');
  assert.throws(() => provider.validateTenant('tenant-c'), /tenant_not_allowed/);
  assert.ok(SCOPES.includes('offline_access') && SCOPES.includes('openid') && SCOPES.includes('https://graph.microsoft.com/Mail.Send'));
});

test('refresh rotates the access and refresh tokens', async () => {
  const db = new Db();
  await db.doc('companies/c1/privateEmailTokens/microsoft_exchange').set({ refreshToken: 'old-refresh', accessToken: 'old', accessTokenExpiresAt: new Date(1), accountEmail: 'user@example.com', tenantId: 'tenant-a' });
  const provider = createMicrosoftProvider({ ...config(db), fetchImpl: async (_url, options) => {
    assert.match(String(options.body), /refresh_token=old-refresh/);
    return response(200, { access_token: 'fresh', refresh_token: 'new-refresh', expires_in: 3600 });
  } });
  assert.equal((await provider.refresh('c1')).token, 'fresh');
  assert.equal(db.values.get('companies/c1/privateEmailTokens/microsoft_exchange').refreshToken, 'new-refresh');
});

test('send allows only the connected or explicitly approved shared mailbox', async () => {
  const db = new Db();
  await db.doc('companies/c1/privateEmailTokens/microsoft_exchange').set({ refreshToken: 'r', accessToken: 'token', accessTokenExpiresAt: new Date(2_000_000), accountEmail: 'user@example.com', tenantId: 'tenant-a' });
  await db.doc('companies/c1/emailIntegration/status').set({ microsoftExchange: { approvedSharedMailboxes: ['billing@example.com'] } });
  const urls = [];
  const provider = createMicrosoftProvider({ ...config(db), fetchImpl: async url => { urls.push(url); return response(202); } });
  await provider.send('c1', { to: ['to@example.com'], subject: 'Invoice', text: 'Attached' }, { email: 'billing@example.com' });
  assert.match(urls[0], /\/users\/billing%40example.com\/sendMail$/);
  await assert.rejects(provider.send('c1', { to: ['to@example.com'] }, { email: 'typed@example.com' }), /sender_not_authorized/);
});

test('Graph message maps recipients, HTML and file attachments', () => {
  const message = graphMessage({ to: ['to@example.com'], cc: ['cc@example.com'], bcc: ['bcc@example.com'], subject: 'S', text: 'plain', html: '<b>html</b>', attachments: [{ filename: 'invoice.pdf', type: 'application/pdf', content: 'cGRm' }] });
  assert.equal(message.body.contentType, 'HTML');
  assert.equal(message.ccRecipients[0].emailAddress.address, 'cc@example.com');
  assert.equal(message.bccRecipients[0].emailAddress.address, 'bcc@example.com');
  assert.deepEqual(message.attachments[0], { '@odata.type': '#microsoft.graph.fileAttachment', name: 'invoice.pdf', contentType: 'application/pdf', contentBytes: 'cGRm' });
});

test('Graph routing uses /me for the connected mailbox and reports throttling', async () => {
  const db = new Db();
  await db.doc('companies/c1/privateEmailTokens/microsoft_exchange').set({ refreshToken: 'r', accessToken: 'token', accessTokenExpiresAt: new Date(2_000_000), accountEmail: 'user@example.com', tenantId: 'tenant-a' });
  await db.doc('companies/c1/emailIntegration/status').set({});
  let called;
  const provider = createMicrosoftProvider({ ...config(db), fetchImpl: async url => { called = url; return response(429, { error: { code: 'TooManyRequests' } }, { 'retry-after': '10' }); } });
  await assert.rejects(provider.send('c1', { to: ['to@example.com'] }, 'USER@example.com'), error => error.message === 'graph_throttled' && error.retryAfter === '10');
  assert.match(called, /\/me\/sendMail$/);
});
