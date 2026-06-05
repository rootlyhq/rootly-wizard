import keytar from 'keytar';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SERVICE_NAME = 'rootly-wizard';
const API_TOKEN_ACCOUNT = 'rootly-token';
const OAUTH_SESSION_ACCOUNT = 'rootly-oauth-session';
const OAUTH_REGISTRATION_ACCOUNT = 'rootly-oauth-registration';
const DEFAULT_API_BASE_URL = 'https://api.rootly.com';
const CALLBACK_PORT = 19797;
const CALLBACK_PATH = '/callback';
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`;
const DEFAULT_SCOPES = ['openid', 'profile', 'email', 'all'];
const REFRESH_SKEW_MS = 30_000;
const AUTH_REQUEST_TIMEOUT_MS = 30_000;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  ));
}

// The Rootly glyph PNG, inlined so the local callback page is self-contained.
const LOGO_DATA_URI = (() => {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const file = path.join(here, '..', 'assets', 'rootly-logo-glyph-purple.png');
    return `data:image/png;base64,${readFileSync(file).toString('base64')}`;
  } catch {
    return null;
  }
})();

// Branded HTML shown in the browser after the OAuth redirect.
function callbackPage({ ok, title, message }) {
  const purple = '#B197FC';
  const statusColor = ok ? '#2FB66B' : '#F4787B';
  const glyph = ok ? '&#10003;' : '&#10005;';
  const logo = LOGO_DATA_URI ? `<img class="logo" src="${LOGO_DATA_URI}" width="92" height="92" alt="Rootly">` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rootly Wizard</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #F6F5FB; color: #16151D; padding: 24px; }
  .card { width: min(400px, 100%); background: #FFFFFF; border: 1px solid #ECEAF5; border-radius: 20px;
    padding: 48px 40px; box-shadow: 0 18px 50px rgba(75, 60, 130, .12); text-align: center; }
  .logo { display: block; width: 92px; height: 92px; margin: 0 auto 28px; }
  h1 { font-size: 22px; font-weight: 650; letter-spacing: -0.2px; margin: 0 0 10px;
    animation: rise .4s ease-out both; }
  h1 .tick { display: inline-block; color: ${statusColor}; font-weight: 700; margin-right: 7px;
    transform: scale(0); animation: pop .45s cubic-bezier(.2, .8, .3, 1.4) .22s forwards; }
  @keyframes rise { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: none; } }
  @keyframes pop { 0% { transform: scale(0); } 60% { transform: scale(1.3); } 100% { transform: scale(1); } }
  @media (prefers-reduced-motion: reduce) {
    h1, h1 .tick { animation: none; transform: none; opacity: 1; }
  }
  p { margin: 0 auto; max-width: 300px; line-height: 1.6; font-size: 15px; color: #5C5870; }
  .btn { margin-top: 28px; appearance: none; cursor: pointer; font: inherit; font-size: 14px; font-weight: 500;
    color: #4A4658; background: #FFFFFF; border: 1px solid #D9D6E5; padding: 10px 22px; border-radius: 10px;
    transition: background .15s, border-color .15s; }
  .btn:hover { background: #F4F2FB; border-color: #C7C2DA; }
  .btn:active { background: #ECE9F6; }
  @media (prefers-color-scheme: dark) {
    body { background: #0D0C12; color: #ECEAF5; }
    .card { background: #16151D; border-color: #272534; box-shadow: none; }
    p { color: #A6A2B8; }
    .btn { color: #C9C5DA; background: transparent; border-color: #34313F; }
    .btn:hover { background: #201E29; border-color: #423E50; }
  }
</style>
</head>
<body>
  <div class="card">
    ${logo}
    <h1><span class="tick">${glyph}</span>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    <button class="btn" type="button" onclick="window.close()">Close this page</button>
  </div>
</body>
</html>`;
}

function authBaseUrl(apiBaseUrl = DEFAULT_API_BASE_URL) {
  const url = new URL(apiBaseUrl);
  const host = url.host.replace(/^api\./, '');
  return `${url.protocol}//${host}`;
}

function openBrowser(url) {
  const platform = process.platform;

  if (platform === 'darwin') {
    return spawn('open', [url], { stdio: 'ignore' });
  }

  if (platform === 'win32') {
    return spawn('rundll32', ['url.dll,FileProtocolHandler', url], {
      stdio: 'ignore',
      windowsHide: true
    });
  }

  return spawn('xdg-open', [url], { stdio: 'ignore' });
}

function jsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function expiresSoon(expiresAt) {
  if (!expiresAt) {
    return false;
  }

  const expiry = new Date(expiresAt).getTime();
  if (Number.isNaN(expiry)) {
    return false;
  }

  return expiry - Date.now() <= REFRESH_SKEW_MS;
}

async function getStoredValue(accountName) {
  try {
    return await keytar.getPassword(SERVICE_NAME, accountName);
  } catch {
    return null;
  }
}

async function setStoredValue(accountName, value) {
  try {
    await keytar.setPassword(SERVICE_NAME, accountName, value);
    return true;
  } catch {
    return false;
  }
}

async function deleteStoredValue(accountName) {
  try {
    return await keytar.deletePassword(SERVICE_NAME, accountName);
  } catch {
    return false;
  }
}

async function loadOAuthSession() {
  const raw = await getStoredValue(OAUTH_SESSION_ACCOUNT);
  if (!raw) {
    return null;
  }

  return jsonParse(raw);
}

async function storeOAuthSession(session) {
  return setStoredValue(OAUTH_SESSION_ACCOUNT, JSON.stringify(session));
}

async function loadOAuthRegistration() {
  const raw = await getStoredValue(OAUTH_REGISTRATION_ACCOUNT);
  if (!raw) {
    return null;
  }

  return jsonParse(raw);
}

async function storeOAuthRegistration(registration) {
  return setStoredValue(OAUTH_REGISTRATION_ACCOUNT, JSON.stringify(registration));
}

async function registerOAuthClient(baseUrl = DEFAULT_API_BASE_URL) {
  const response = await fetch(new URL('/oauth/register', authBaseUrl(baseUrl)), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      client_name: 'Rootly Wizard',
      redirect_uris: [REDIRECT_URI],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code']
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`OAuth registration failed: ${response.status}${text ? ` - ${text}` : ''}`);
  }

  const payload = await response.json();
  const clientId = payload?.client_id;
  if (!clientId) {
    throw new Error('OAuth registration response did not include client_id');
  }

  const scopes = typeof payload?.scope === 'string' && payload.scope.trim()
    ? payload.scope.trim().split(/\s+/)
    : DEFAULT_SCOPES;

  return { clientId, scopes };
}

async function resolveOAuthRegistration(baseUrl = DEFAULT_API_BASE_URL) {
  const cached = await loadOAuthRegistration();
  if (cached?.clientId) {
    return {
      clientId: cached.clientId,
      scopes: Array.isArray(cached.scopes) && cached.scopes.length ? cached.scopes : DEFAULT_SCOPES
    };
  }

  const registration = await registerOAuthClient(baseUrl);
  await storeOAuthRegistration(registration);
  return registration;
}

async function exchangeOAuthCode({ code, codeVerifier, clientId, baseUrl = DEFAULT_API_BASE_URL }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: codeVerifier
  });

  const response = await fetch(new URL('/oauth/token', authBaseUrl(baseUrl)), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
    body
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error_description || payload?.error || `OAuth token exchange failed (${response.status})`);
  }

  return payload;
}

async function refreshOAuthAccessToken(session) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: session.clientId,
    refresh_token: session.refreshToken
  });

  const response = await fetch(new URL('/oauth/token', authBaseUrl(session.baseUrl || DEFAULT_API_BASE_URL)), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
    body
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error_description || payload?.error || `OAuth refresh failed (${response.status})`);
  }

  const refreshed = {
    ...session,
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || session.refreshToken,
    tokenType: payload.token_type || session.tokenType || 'Bearer',
    expiresAt: payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000).toISOString() : session.expiresAt
  };

  await storeOAuthSession(refreshed);
  return refreshed;
}

function sessionToStoredShape(baseUrl, registration, tokenPayload) {
  return {
    kind: 'oauth',
    baseUrl,
    clientId: registration.clientId,
    scopes: registration.scopes,
    accessToken: tokenPayload.access_token,
    refreshToken: tokenPayload.refresh_token,
    tokenType: tokenPayload.token_type || 'Bearer',
    expiresAt: tokenPayload.expires_in
      ? new Date(Date.now() + tokenPayload.expires_in * 1000).toISOString()
      : null
  };
}

export async function getStoredToken() {
  if (process.env.ROOTLY_TOKEN?.trim()) {
    return process.env.ROOTLY_TOKEN.trim();
  }

  const apiToken = await getStoredValue(API_TOKEN_ACCOUNT);
  if (apiToken) {
    return apiToken;
  }

  const oauthSession = await loadOAuthSession();
  if (!oauthSession?.accessToken) {
    return null;
  }

  if (!expiresSoon(oauthSession.expiresAt)) {
    return oauthSession.accessToken;
  }

  if (!oauthSession.refreshToken) {
    return oauthSession.accessToken;
  }

  try {
    const refreshed = await refreshOAuthAccessToken(oauthSession);
    return refreshed.accessToken;
  } catch {
    return oauthSession.accessToken;
  }
}

export async function getAuthSummary() {
  if (process.env.ROOTLY_TOKEN?.trim()) {
    return {
      mode: 'env-token',
      label: 'Using ROOTLY_TOKEN from environment'
    };
  }

  const apiToken = await getStoredValue(API_TOKEN_ACCOUNT);
  if (apiToken) {
    return {
      mode: 'stored-token',
      label: 'Stored API key found in keychain'
    };
  }

  const oauthSession = await loadOAuthSession();
  if (oauthSession?.accessToken) {
    return {
      mode: 'oauth',
      label: 'Stored Rootly browser session found'
    };
  }

  return null;
}

export async function storeToken(token) {
  if (process.env.ROOTLY_TOKEN?.trim()) {
    return false;
  }

  await deleteStoredValue(OAUTH_SESSION_ACCOUNT);
  return setStoredValue(API_TOKEN_ACCOUNT, token);
}

export async function deleteToken() {
  if (process.env.ROOTLY_TOKEN?.trim()) {
    return false;
  }

  const [deletedApiToken, deletedOAuthSession, deletedRegistration] = await Promise.all([
    deleteStoredValue(API_TOKEN_ACCOUNT),
    deleteStoredValue(OAUTH_SESSION_ACCOUNT),
    deleteStoredValue(OAUTH_REGISTRATION_ACCOUNT)
  ]);

  return deletedApiToken || deletedOAuthSession || deletedRegistration;
}

export async function validateToken(token, baseUrl = DEFAULT_API_BASE_URL) {
  const response = await fetch(new URL('/v1/users/me', baseUrl), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS)
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

async function probeTokenValidation(token, baseUrl = DEFAULT_API_BASE_URL) {
  const response = await fetch(new URL('/v1/users/me', baseUrl), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS)
  });

  const body = await response.text().catch(() => '');
  return {
    ok: response.ok,
    status: response.status,
    body
  };
}

export async function startOAuthLogin(baseUrl = DEFAULT_API_BASE_URL) {
  const registration = await resolveOAuthRegistration(baseUrl);
  const state = crypto.randomBytes(32).toString('base64url');
  const codeVerifier = crypto.randomBytes(48).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  const authorizeUrl = new URL('/oauth/authorize', authBaseUrl(baseUrl));
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', registration.clientId);
  authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  if (Array.isArray(registration.scopes) && registration.scopes.length > 0) {
    authorizeUrl.searchParams.set('scope', registration.scopes.join(' '));
  }
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('code_challenge', codeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');

  const callbackResult = await new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId;
    const server = http.createServer((req, res) => {
      const requestUrl = new URL(req.url || '/', REDIRECT_URI);
      if (requestUrl.pathname !== CALLBACK_PATH) {
        res.writeHead(404).end('Not found');
        return;
      }

      const finish = (fn) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeoutId);
        setTimeout(() => server.close(), 50).unref();
        fn();
      };

      if (requestUrl.searchParams.get('state') !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(callbackPage({
          ok: false,
          title: 'Sign-in failed',
          message: 'The sign-in request could not be verified (state mismatch). Return to the terminal and try again.'
        }));
        finish(() => reject(new Error('OAuth state mismatch')));
        return;
      }

      const error = requestUrl.searchParams.get('error');
      if (error) {
        const description = requestUrl.searchParams.get('error_description') || error;
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(callbackPage({ ok: false, title: 'Sign-in failed', message: description }));
        finish(() => reject(new Error(description)));
        return;
      }

      const code = requestUrl.searchParams.get('code');
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(callbackPage({
          ok: false,
          title: 'Sign-in failed',
          message: 'No authorization code was returned. Return to the terminal and try again.'
        }));
        finish(() => reject(new Error('Missing OAuth authorization code')));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(callbackPage({
        ok: true,
        title: 'You\'re signed in',
        message: 'Rootly Wizard is finishing sign-in in your terminal.'
      }));
      finish(() => resolve({ code }));
    });

    server.on('error', (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);
      reject(error);
    });

    server.listen(CALLBACK_PORT, '127.0.0.1', async () => {
      try {
        const child = openBrowser(authorizeUrl.toString());
        child.on('error', (error) => {
          if (settled) {
            return;
          }

          settled = true;
          clearTimeout(timeoutId);
          server.close();
          reject(error);
        });
        child.unref();
      } catch (error) {
        settled = true;
        clearTimeout(timeoutId);
        server.close();
        reject(error);
      }
    });

    timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      server.close();
      reject(new Error('OAuth login timed out after 5 minutes'));
    }, 5 * 60 * 1000);
    timeoutId.unref();
  });

  console.log('Authorization received. Finalizing browser sign-in...');

  const tokenPayload = await exchangeOAuthCode({
    code: callbackResult.code,
    codeVerifier,
    clientId: registration.clientId,
    baseUrl
  });

  console.log(`OAuth token response: type=${tokenPayload?.token_type || 'unknown'} expires_in=${tokenPayload?.expires_in || 'unknown'} scope=${tokenPayload?.scope || '(none returned)'}`);

  const session = sessionToStoredShape(baseUrl, registration, tokenPayload);
  console.log('Storing browser session securely...');
  const stored = await storeOAuthSession(session);
  if (!stored) {
    throw new Error('OAuth login succeeded, but the browser session could not be stored securely');
  }

  console.log('Validating browser session access...');
  const userPayload = await validateToken(session.accessToken, baseUrl);
  if (!userPayload) {
    const probe = await probeTokenValidation(session.accessToken, baseUrl);
    console.log(`OAuth validation probe: ok=${probe.ok} status=${probe.status} body=${probe.body || '(empty)'}`);
    throw new Error('OAuth login succeeded, but token validation failed');
  }

  await deleteStoredValue(API_TOKEN_ACCOUNT);

  return {
    stored,
    userPayload,
    accessToken: session.accessToken
  };
}
