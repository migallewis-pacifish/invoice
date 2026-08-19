const { createHash, randomBytes } = require('crypto');

const PROVIDER = 'microsoft_exchange';
const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
const AUTHORITY = 'https://login.microsoftonline.com/organizations/oauth2/v2.0';
const SCOPES = ['openid', 'profile', 'email', 'offline_access', 'https://graph.microsoft.com/Mail.Send'];
const STATE_TTL_MS = 10 * 60 * 1000;

const stateHash = value => createHash('sha256').update(String(value)).digest('hex');
const normalizeEmail = value => String(value || '').trim().toLowerCase();

function parseTenantPolicy(value) {
  const tenants = String(value || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  return { mode: tenants.length === 1 ? 'single_tenant' : 'allow_list', tenants };
}

function decodeJwtPayload(token) {
  try { return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8')); } catch { throw new Error('invalid_identity_token'); }
}

function graphMessage({ to, cc, bcc, subject, text, html, attachments = [] }) {
  const recipients = values => [].concat(values || []).filter(Boolean).map(address => ({ emailAddress: { address } }));
  return {
    subject: String(subject || ''),
    body: { contentType: html == null ? 'Text' : 'HTML', content: html == null ? String(text || '') : String(html) },
    toRecipients: recipients(to), ccRecipients: recipients(cc), bccRecipients: recipients(bcc),
    attachments: attachments.map(attachment => ({
      '@odata.type': '#microsoft.graph.fileAttachment', name: attachment.filename,
      contentType: attachment.type || 'application/octet-stream', contentBytes: attachment.content,
    })),
  };
}

function createMicrosoftProvider({ db, fetchImpl = fetch, clientId, clientSecret, redirectUri, allowedTenants, now = () => Date.now() }) {
  const policy = () => parseTenantPolicy(allowedTenants());
  const configured = () => Boolean(clientId() && clientSecret() && redirectUri() && policy().tenants.length);
  const tokenRef = companyId => db.doc(`companies/${companyId}/privateEmailTokens/microsoft_exchange`);

  function validateTenant(tenantId) {
    const tenant = String(tenantId || '').toLowerCase();
    if (!tenant || !policy().tenants.includes(tenant)) throw new Error('tenant_not_allowed');
    return tenant;
  }

  async function start({ uid, companyId, loginHint }) {
    if (!configured()) throw new Error('not_configured');
    const state = randomBytes(32).toString('base64url');
    const nonce = randomBytes(24).toString('base64url');
    await db.doc(`emailOAuthStates/${stateHash(state)}`).set({ uid, companyId, provider: PROVIDER, nonce, expiresAt: new Date(now() + STATE_TTL_MS), createdAt: new Date(now()) });
    const params = new URLSearchParams({ client_id: clientId(), redirect_uri: redirectUri(), response_type: 'code', response_mode: 'query', scope: SCOPES.join(' '), prompt: 'select_account', state, nonce });
    if (loginHint) params.set('login_hint', loginHint);
    return `${AUTHORITY}/authorize?${params}`;
  }

  async function consumeState(state) {
    if (!state) throw new Error('invalid_state');
    const ref = db.doc(`emailOAuthStates/${stateHash(state)}`);
    return db.runTransaction(async transaction => {
      const snap = await transaction.get(ref);
      const value = snap.exists ? snap.data() : null;
      const expiry = value?.expiresAt?.toDate ? value.expiresAt.toDate().getTime() : new Date(value?.expiresAt || 0).getTime();
      if (!value || value.provider !== PROVIDER || expiry <= now()) throw new Error('invalid_state');
      transaction.delete(ref);
      return value;
    });
  }

  async function tokenRequest(params) {
    const response = await fetchImpl(`${AUTHORITY}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...params, client_id: clientId(), client_secret: clientSecret(), scope: SCOPES.join(' ') }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(['invalid_grant', 'interaction_required', 'consent_required'].includes(body.error) ? 'expired_consent' : 'oauth_token_error');
    return body;
  }

  async function graph(accessToken, path, options = {}) {
    const response = await fetchImpl(`${GRAPH_ROOT}${path}`, { ...options, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(options.headers || {}) } });
    if (response.ok) return response.status === 204 ? {} : response.json();
    const body = await response.json().catch(() => ({}));
    const code = body?.error?.code;
    const error = new Error(response.status === 401 || ['InvalidAuthenticationToken', 'Authorization_RequestDenied'].includes(code) ? 'expired_consent' : response.status === 429 ? 'graph_throttled' : 'graph_error');
    error.status = response.status;
    error.retryAfter = response.headers?.get?.('retry-after') || null;
    error.graphCode = code || null;
    throw error;
  }

  async function callback({ state, code }) {
    const bound = await consumeState(state);
    if (!code) throw new Error('authorization_denied');
    const tokens = await tokenRequest({ code, redirect_uri: redirectUri(), grant_type: 'authorization_code' });
    if (!tokens.refresh_token || !tokens.id_token) throw new Error('missing_refresh_token');
    const claims = decodeJwtPayload(tokens.id_token);
    if (claims.aud !== clientId() || claims.nonce !== bound.nonce || Number(claims.exp || 0) * 1000 <= now()) throw new Error('invalid_identity_token');
    const tenantId = validateTenant(claims.tid);
    const identity = await graph(tokens.access_token, '/me?$select=mail,userPrincipalName,displayName,id');
    const accountEmail = normalizeEmail(identity.mail || identity.userPrincipalName);
    if (!accountEmail) throw new Error('mailbox_missing');
    await tokenRef(bound.companyId).set({ refreshToken: tokens.refresh_token, accessToken: tokens.access_token, accessTokenExpiresAt: new Date(now() + Number(tokens.expires_in || 3600) * 1000), accountEmail, tenantId, userId: identity.id, scopes: tokens.scope || SCOPES.join(' '), connectedBy: bound.uid, connectedAt: new Date(now()), health: 'healthy', updatedAt: new Date(now()) });
    await db.doc(`companies/${bound.companyId}/emailIntegration/status`).set({ microsoftExchange: { connected: true, configured: true } }, { merge: true });
    return { ...bound, accountEmail, tenantId };
  }

  async function markDisconnected(companyId, reason) {
    await tokenRef(companyId).set({ health: reason, updatedAt: new Date(now()) }, { merge: true });
    await db.doc(`companies/${companyId}/emailIntegration/status`).set({ microsoftExchange: { connected: false, configured: configured() } }, { merge: true });
  }

  async function accessToken(companyId, forceRefresh = false) {
    const snap = await tokenRef(companyId).get();
    if (!snap.exists) throw new Error('not_connected');
    const saved = snap.data();
    validateTenant(saved.tenantId);
    const expiry = saved.accessTokenExpiresAt?.toDate ? saved.accessTokenExpiresAt.toDate().getTime() : new Date(saved.accessTokenExpiresAt || 0).getTime();
    if (!forceRefresh && saved.accessToken && expiry > now() + 60_000) return { token: saved.accessToken, accountEmail: saved.accountEmail, tenantId: saved.tenantId };
    try {
      const fresh = await tokenRequest({ refresh_token: saved.refreshToken, grant_type: 'refresh_token' });
      await tokenRef(companyId).set({ accessToken: fresh.access_token, refreshToken: fresh.refresh_token || saved.refreshToken, accessTokenExpiresAt: new Date(now() + Number(fresh.expires_in || 3600) * 1000), updatedAt: new Date(now()) }, { merge: true });
      return { token: fresh.access_token, accountEmail: saved.accountEmail, tenantId: saved.tenantId };
    } catch (error) {
      if (error.message === 'expired_consent') await markDisconnected(companyId, error.message);
      throw error;
    }
  }

  async function health(companyId) {
    try {
      const auth = await accessToken(companyId);
      const identity = await graph(auth.token, '/me?$select=mail,userPrincipalName');
      if (normalizeEmail(identity.mail || identity.userPrincipalName) !== normalizeEmail(auth.accountEmail)) throw new Error('mailbox_mismatch');
      return { connected: true, accountEmail: auth.accountEmail, tenantId: auth.tenantId };
    } catch (error) { await markDisconnected(companyId, error.message); return { connected: false, reason: error.message }; }
  }

  async function disconnect(companyId) {
    await tokenRef(companyId).delete();
    await markDisconnected(companyId, 'disconnected');
    return { connected: false };
  }

  async function approvedSenders(companyId, accountEmail) {
    const status = (await db.doc(`companies/${companyId}/emailIntegration/status`).get()).data() || {};
    const shared = status.microsoftExchange?.approvedSharedMailboxes || [];
    return new Set([accountEmail, ...shared].map(normalizeEmail).filter(Boolean));
  }

  async function send(companyId, message, selectedSender) {
    const auth = await accessToken(companyId);
    const sender = normalizeEmail(selectedSender?.email || selectedSender || auth.accountEmail);
    if (!(await approvedSenders(companyId, auth.accountEmail)).has(sender)) throw new Error('sender_not_authorized');
    const path = sender === normalizeEmail(auth.accountEmail) ? '/me/sendMail' : `/users/${encodeURIComponent(sender)}/sendMail`;
    await graph(auth.token, path, { method: 'POST', body: JSON.stringify({ message: graphMessage(message), saveToSentItems: true }) });
    return `graph-${now()}`;
  }

  return { configured, tenantPolicy: policy, validateTenant, start, consumeState, callback, accessToken, refresh: companyId => accessToken(companyId, true), health, disconnect, send };
}

module.exports = { createMicrosoftProvider, graphMessage, parseTenantPolicy, SCOPES, STATE_TTL_MS };
