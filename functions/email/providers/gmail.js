const { createHash, randomBytes } = require('crypto');

const PROVIDER = 'gmail';
const SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const OAUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const PROFILE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/profile';
const STATE_TTL_MS = 10 * 60 * 1000;

const stateHash = state => createHash('sha256').update(String(state)).digest('hex');
const base64Url = value => Buffer.from(value).toString('base64url');
const cleanHeader = value => String(value || '').replace(/[\r\n]+/g, ' ').trim();

function buildMimeMessage({ from, to, cc, bcc, subject, text, html, attachments = [] }) {
  const mixed = `mixed_${randomBytes(12).toString('hex')}`;
  const alternative = `alt_${randomBytes(12).toString('hex')}`;
  const lines = [
    `From: ${cleanHeader(from)}`,
    `To: ${[].concat(to || []).map(cleanHeader).filter(Boolean).join(', ')}`,
  ];
  if ([].concat(cc || []).filter(Boolean).length) lines.push(`Cc: ${[].concat(cc).map(cleanHeader).join(', ')}`);
  if ([].concat(bcc || []).filter(Boolean).length) lines.push(`Bcc: ${[].concat(bcc).map(cleanHeader).join(', ')}`);
  lines.push(`Subject: =?UTF-8?B?${Buffer.from(cleanHeader(subject)).toString('base64')}?=`, 'MIME-Version: 1.0');

  if (attachments.length) {
    lines.push(`Content-Type: multipart/mixed; boundary="${mixed}"`, '', `--${mixed}`);
  }
  if (html != null) {
    lines.push(`Content-Type: multipart/alternative; boundary="${alternative}"`, '',
      `--${alternative}`, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', Buffer.from(text || '').toString('base64'),
      `--${alternative}`, 'Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', Buffer.from(html).toString('base64'), `--${alternative}--`);
  } else {
    lines.push('Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', Buffer.from(text || '').toString('base64'));
  }
  for (const attachment of attachments) {
    const filename = cleanHeader(attachment.filename);
    lines.push('', `--${mixed}`, `Content-Type: ${cleanHeader(attachment.type) || 'application/octet-stream'}; name="${filename}"`,
      'Content-Transfer-Encoding: base64', `Content-Disposition: attachment; filename="${filename}"`, '',
      String(attachment.content || '').replace(/(.{76})/g, '$1\r\n'));
  }
  if (attachments.length) lines.push('', `--${mixed}--`);
  return lines.join('\r\n');
}

function createGmailProvider({ db, fetchImpl = fetch, clientId, clientSecret, redirectUri, now = () => Date.now() }) {
  const configured = () => Boolean(clientId() && clientSecret() && redirectUri());
  const tokenRef = companyId => db.doc(`companies/${companyId}/privateEmailTokens/gmail`);

  async function createState(uid, companyId, requestedMailbox) {
    const state = randomBytes(32).toString('base64url');
    await db.doc(`emailOAuthStates/${stateHash(state)}`).set({ uid, companyId, provider: PROVIDER, requestedMailbox: requestedMailbox || null, expiresAt: new Date(now() + STATE_TTL_MS), createdAt: new Date(now()) });
    return state;
  }

  async function consumeState(state) {
    if (!state) throw new Error('invalid_state');
    const ref = db.doc(`emailOAuthStates/${stateHash(state)}`);
    return db.runTransaction(async transaction => {
      const snap = await transaction.get(ref);
      const value = snap.exists ? snap.data() : null;
      const expiresAt = value?.expiresAt?.toDate ? value.expiresAt.toDate() : new Date(value?.expiresAt || 0);
      if (!value || value.provider !== PROVIDER || expiresAt.getTime() <= now()) throw new Error('invalid_state');
      transaction.delete(ref); // Atomic deletion makes the bearer state single use.
      return value;
    });
  }

  async function start({ uid, companyId, requestedMailbox }) {
    if (!configured()) throw new Error('not_configured');
    const state = await createState(uid, companyId, requestedMailbox);
    const params = new URLSearchParams({ client_id: clientId(), redirect_uri: redirectUri(), response_type: 'code', scope: SEND_SCOPE,
      access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false', state });
    if (requestedMailbox) params.set('login_hint', requestedMailbox);
    return `${OAUTH_BASE}?${params}`;
  }

  async function tokenRequest(params) {
    const response = await fetchImpl(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...params, client_id: clientId(), client_secret: clientSecret() }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error === 'invalid_grant' ? 'revoked_consent' : 'oauth_token_error');
    return body;
  }

  async function profile(accessToken) {
    const response = await fetchImpl(PROFILE_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error(response.status === 401 ? 'revoked_consent' : 'profile_error');
    return response.json();
  }

  async function callback({ state, code }) {
    const bound = await consumeState(state);
    if (!code) throw new Error('authorization_denied');
    const tokens = await tokenRequest({ code, redirect_uri: redirectUri(), grant_type: 'authorization_code' });
    if (!tokens.refresh_token) throw new Error('missing_refresh_token');
    const identity = await profile(tokens.access_token);
    const email = String(identity.emailAddress || '').toLowerCase();
    if (!email || (bound.requestedMailbox && email !== String(bound.requestedMailbox).toLowerCase())) throw new Error('mailbox_mismatch');
    await tokenRef(bound.companyId).set({ refreshToken: tokens.refresh_token, accessToken: tokens.access_token, accessTokenExpiresAt: new Date(now() + Number(tokens.expires_in || 3600) * 1000), accountEmail: email, scopes: tokens.scope || SEND_SCOPE, connectedBy: bound.uid, connectedAt: new Date(now()), health: 'healthy', updatedAt: new Date(now()) });
    await db.doc(`companies/${bound.companyId}/emailIntegration/status`).set({ gmail: { connected: true, configured: true } }, { merge: true });
    return { ...bound, accountEmail: email };
  }

  async function accessToken(companyId) {
    const snap = await tokenRef(companyId).get();
    if (!snap.exists) throw new Error('not_connected');
    const saved = snap.data();
    const expiry = saved.accessTokenExpiresAt?.toDate ? saved.accessTokenExpiresAt.toDate().getTime() : new Date(saved.accessTokenExpiresAt || 0).getTime();
    if (saved.accessToken && expiry > now() + 60_000) return { token: saved.accessToken, accountEmail: saved.accountEmail };
    try {
      const fresh = await tokenRequest({ refresh_token: saved.refreshToken, grant_type: 'refresh_token' });
      await tokenRef(companyId).set({ accessToken: fresh.access_token, accessTokenExpiresAt: new Date(now() + Number(fresh.expires_in || 3600) * 1000), updatedAt: new Date(now()) }, { merge: true });
      return { token: fresh.access_token, accountEmail: saved.accountEmail };
    } catch (error) {
      if (error.message === 'revoked_consent') await markDisconnected(companyId, 'revoked_consent');
      throw error;
    }
  }

  async function markDisconnected(companyId, reason) {
    await tokenRef(companyId).set({ health: reason, updatedAt: new Date(now()) }, { merge: true });
    await db.doc(`companies/${companyId}/emailIntegration/status`).set({ gmail: { connected: false, configured: configured() } }, { merge: true });
  }

  async function health(companyId) {
    try {
      const auth = await accessToken(companyId);
      const identity = await profile(auth.token);
      if (String(identity.emailAddress).toLowerCase() !== String(auth.accountEmail).toLowerCase()) throw new Error('mailbox_mismatch');
      return { connected: true, accountEmail: auth.accountEmail };
    } catch (error) {
      await markDisconnected(companyId, error.message);
      return { connected: false, reason: error.message };
    }
  }

  async function disconnect(companyId) {
    const snap = await tokenRef(companyId).get();
    if (snap.exists && snap.data().refreshToken) await fetchImpl(`${REVOKE_URL}?token=${encodeURIComponent(snap.data().refreshToken)}`, { method: 'POST' }).catch(() => undefined);
    await tokenRef(companyId).delete();
    await markDisconnected(companyId, 'disconnected');
    return { connected: false };
  }

  async function send(companyId, message) {
    const auth = await accessToken(companyId);
    if (message.from && String(message.from).toLowerCase() !== String(auth.accountEmail).toLowerCase()) throw new Error('mailbox_mismatch');
    const raw = base64Url(buildMimeMessage({ ...message, from: auth.accountEmail }));
    const response = await fetchImpl('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw }) });
    const body = await response.json();
    if (!response.ok) throw new Error(response.status === 401 ? 'revoked_consent' : 'gmail_send_error');
    return body.id;
  }

  return { configured, start, callback, accessToken, health, disconnect, send, consumeState };
}

module.exports = { createGmailProvider, buildMimeMessage, stateHash, SEND_SCOPE, STATE_TTL_MS };
