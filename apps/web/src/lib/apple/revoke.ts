import 'server-only';
import { createSign } from 'node:crypto';

/**
 * Apple's side of "Sign in with Apple" account deletion: exchange the sign-in's authorization code for a refresh token,
 * and later revoke it. Needs an Apple key (APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY); without one every call is skipped.
 * The key never leaves the server.
 */
const APPLE = 'https://appleid.apple.com';

function config() {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const privateKey = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientId = process.env.APPLE_CLIENT_ID || 'com.sleekconnect.store';
  return teamId && keyId && privateKey ? { teamId, keyId, privateKey, clientId } : null;
}

export const appleConfigured = () => config() !== null;

const base64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

/** The "client secret" Apple wants: a short-lived token signed with the Apple key (ES256). */
function clientSecret(c: NonNullable<ReturnType<typeof config>>) {
  const now = Math.floor(Date.now() / 1000);
  const head = base64url(JSON.stringify({ alg: 'ES256', kid: c.keyId }));
  const body = base64url(JSON.stringify({ iss: c.teamId, iat: now, exp: now + 300, aud: APPLE, sub: c.clientId }));
  const signature = createSign('SHA256').update(`${head}.${body}`).sign({ key: c.privateKey, dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${base64url(signature)}`;
}

async function post(path: string, params: Record<string, string>) {
  return fetch(`${APPLE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(8000),
  });
}

/** Turns the authorization code from the sign-in into a refresh token, or null if Apple refuses it. */
export async function exchangeAuthorizationCode(code: string): Promise<string | null> {
  const c = config();
  if (!c) return null;
  const response = await post('/auth/token', { client_id: c.clientId, client_secret: clientSecret(c), code, grant_type: 'authorization_code' });
  if (!response.ok) return null;
  const json = (await response.json()) as { refresh_token?: string };
  return json.refresh_token ?? null;
}

/** Ends the link between this person's Apple ID and the app. */
export async function revokeRefreshToken(token: string): Promise<boolean> {
  const c = config();
  if (!c) return false;
  const response = await post('/auth/revoke', { client_id: c.clientId, client_secret: clientSecret(c), token, token_type_hint: 'refresh_token' });
  return response.ok;
}
