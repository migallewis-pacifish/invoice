const { HttpsError } = require('firebase-functions/v2/https');

const PROVIDERS = new Set(['gmail', 'microsoft_exchange', 'company_sendgrid', 'nexus_fallback']);

function canonicalProvider(provider) {
  // `sendgrid` was the original public value. Keep stored company settings and
  // older clients working while making its ownership explicit.
  return provider === 'sendgrid' ? 'company_sendgrid' : provider;
}

function providerIsUsable(provider, integrations, configuration = {}) {
  if (provider === 'gmail') return integrations.gmail?.connected === true && configuration.gmail !== false;
  if (provider === 'microsoft_exchange') return integrations.microsoftExchange?.connected === true && configuration.microsoftExchange !== false;
  if (provider === 'company_sendgrid') {
    return integrations.sendgrid?.mode === 'company_owned_sendgrid' && integrations.sendgrid?.connected === true &&
      integrations.sendgrid?.apiKeyConfigured === true &&
      (integrations.sendgrid?.senderVerified === true || integrations.sendgrid?.domainVerified === true);
  }
  return provider === 'nexus_fallback' && integrations.nexusFallback?.mode === 'nexus_managed_fallback' &&
    integrations.nexusFallback?.enabled === true && configuration.nexusFallback !== false;
}

function resolveRoute(requestedProvider, integrations = {}, configuration = {}) {
  const provider = canonicalProvider(requestedProvider || integrations.defaultProvider || 'nexus_fallback');
  if (!PROVIDERS.has(provider)) {
    throw new HttpsError('failed-precondition', `Email provider ${provider} is not available.`);
  }
  if (providerIsUsable(provider, integrations, configuration)) return {
    provider,
    requestedProvider: provider,
    fallbackReason: null,
  };
  if (provider !== 'nexus_fallback' && providerIsUsable('nexus_fallback', integrations, configuration)) {
    return {
      provider: 'nexus_fallback',
      requestedProvider: provider,
      fallbackReason: `${provider}_unavailable`,
    };
  }
  throw new HttpsError('failed-precondition', `Email provider ${provider} is not connected or configured.`);
}

async function dispatchEmail({ requestedProvider, integrations, configuration, message, adapters }) {
  const route = resolveRoute(requestedProvider, integrations, configuration);
  const { provider } = route;
  const adapter = adapters[provider];
  if (typeof adapter !== 'function') {
    throw new HttpsError('failed-precondition', `Email provider ${provider} is not available.`);
  }
  const result = await adapter(message, integrations);
  const messageId = typeof result === 'string' ? result : result?.messageId;
  if (!messageId) throw new HttpsError('internal', `${provider} did not return a message ID.`);
  return {
    provider,
    effectiveProvider: provider,
    requestedProvider: route.requestedProvider,
    fallbackReason: route.fallbackReason,
    messageId,
    accepted: typeof result === 'object' && result.accepted !== undefined ? !!result.accepted : true,
    sentAt: typeof result === 'object' && result.sentAt ? result.sentAt : new Date().toISOString(),
  };
}

module.exports = { canonicalProvider, dispatchEmail, providerIsUsable, resolveRoute };
