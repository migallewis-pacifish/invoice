const test = require('node:test');
const assert = require('node:assert/strict');
const { dispatchEmail } = require('./email/dispatcher');

const message = Object.freeze({ to: ['client@example.com'], cc: [], bcc: [], subject: 'Invoice', text: 'Attached', attachments: [], sender: {} });

function integrationsFor(provider) {
  return {
    defaultProvider: provider,
    gmail: { connected: true },
    microsoftExchange: { connected: true },
    sendgrid: { mode: 'company_owned_sendgrid', connected: true, apiKeyConfigured: true, senderVerified: true },
    nexusFallback: { mode: 'nexus_managed_fallback', enabled: true },
  };
}

for (const provider of ['gmail', 'microsoft_exchange', 'company_sendgrid', 'nexus_fallback']) {
  test(`${provider} selection invokes only its adapter`, async () => {
    const calls = [];
    const adapters = Object.fromEntries(['gmail', 'microsoft_exchange', 'company_sendgrid', 'nexus_fallback']
      .map(name => [name, async received => { calls.push(name); assert.equal(received, message); return { messageId: `${name}-id` }; }]));

    const response = await dispatchEmail({ requestedProvider: provider, integrations: integrationsFor(provider), message, adapters });

    assert.deepEqual(calls, [provider]);
    assert.deepEqual(response, { provider, effectiveProvider: provider, requestedProvider: provider, fallbackReason: null, messageId: `${provider}-id`, accepted: true, sentAt: response.sentAt });
  });
}

test('an unavailable provider returns a clear precondition error', async () => {
  await assert.rejects(
    dispatchEmail({ requestedProvider: 'gmail', integrations: { gmail: { connected: false } }, message, adapters: {} }),
    error => error.code === 'failed-precondition' && /not connected or configured/.test(error.message),
  );
});

test('an unavailable provider uses only an explicitly enabled fallback', async () => {
  const calls = [];
  const response = await dispatchEmail({
    requestedProvider: 'gmail',
    integrations: { gmail: { connected: false }, nexusFallback: { mode: 'nexus_managed_fallback', enabled: true } },
    message,
    adapters: { nexus_fallback: async () => { calls.push('nexus_fallback'); return 'fallback-id'; } },
  });
  assert.deepEqual(calls, ['nexus_fallback']);
  assert.equal(response.provider, 'nexus_fallback');
  assert.equal(response.effectiveProvider, 'nexus_fallback');
  assert.equal(response.requestedProvider, 'gmail');
  assert.equal(response.fallbackReason, 'gmail_unavailable');
});

test('legacy sendgrid selection routes to the company adapter', async () => {
  const calls = [];
  const response = await dispatchEmail({
    requestedProvider: 'sendgrid', integrations: integrationsFor('sendgrid'), message,
    adapters: { company_sendgrid: async () => { calls.push('company_sendgrid'); return 'company-id'; } },
  });
  assert.deepEqual(calls, ['company_sendgrid']);
  assert.equal(response.provider, 'company_sendgrid');
});
