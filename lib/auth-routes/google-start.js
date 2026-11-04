import { createHash, createHmac, randomBytes } from 'node:crypto';
import { json } from '../auth.js';

const COOKIE = 'adlink_google_state';
function sign(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}
function cookie(value) {
  return COOKIE + '=' + encodeURIComponent(value) + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600';
}
export default async function handler(request) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, { allow: 'GET' });
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET;
  if (!clientId || !redirectUri || !secret) return json({ error: 'Google sign-in is not configured yet. Please use email and password for now.' }, 503);
  const url = new URL(request.url);
  const role = url.searchParams.get('role');
  if (!['advertiser', 'publisher'].includes(role)) return json({ error: 'Choose Advertiser or Publisher before continuing with Google.' }, 400);
  const nonce = randomBytes(32).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const payload = Buffer.from(JSON.stringify({ nonce, verifier, role, issued: Date.now() })).toString('base64url');
  const stateCookie = payload + '.' + sign(payload, secret);
  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.searchParams.set('client_id', clientId);
  auth.searchParams.set('redirect_uri', redirectUri);
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('scope', 'openid email profile');
  auth.searchParams.set('state', nonce);
  auth.searchParams.set('code_challenge', challenge);
  auth.searchParams.set('code_challenge_method', 'S256');
  auth.searchParams.set('prompt', 'select_account');
  return new Response(null, { status: 302, headers: { location: auth.toString(), 'set-cookie': cookie(stateCookie), 'cache-control': 'no-store' } });
}
