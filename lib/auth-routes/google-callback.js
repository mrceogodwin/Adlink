import { createHmac, timingSafeEqual } from 'node:crypto';
import { db, json, createSession, cookieHeader } from '../auth.js';
import { readCookie } from '../server-auth.js';

const COOKIE = 'adlink_google_state';
function clearCookie() { return COOKIE + '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'; }
function redirect(path, extraCookies = []) {
  const headers = new Headers({ location: path, 'cache-control': 'no-store' });
  headers.append('set-cookie', clearCookie());
  for (const value of extraCookies) headers.append('set-cookie', value);
  return new Response(null, { status: 302, headers });
}
function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}
export default async function handler(request) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, { allow: 'GET' });
  const url = new URL(request.url);
  const fail = reason => redirect('/login?google_error=' + encodeURIComponent(reason));
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!secret || !clientId || !clientSecret || !redirectUri || !process.env.DATABASE_URL) return fail('Google sign-in is not configured.');
  const stateValue = readCookie(request, COOKIE);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!stateValue || !state || !code || url.searchParams.has('error')) return fail('Google sign-in was cancelled or could not be verified.');
  const parts = stateValue.split('.');
  if (parts.length !== 2) return fail('Google sign-in session expired. Please try again.');
  const [payload, signature] = parts;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  if (!safeEqual(signature, expected)) return fail('Google sign-in could not be verified.');
  let pending;
  try { pending = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return fail('Google sign-in session is invalid.'); }
  if (pending.nonce !== state || !['advertiser', 'publisher'].includes(pending.role) || !pending.verifier || Date.now() - pending.issued > 10 * 60 * 1000 || pending.issued > Date.now() + 30000) return fail('Google sign-in session expired. Please try again.');
  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: pending.verifier })
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.access_token) return fail('Google could not verify this sign-in. Please try again.');
    const userResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: 'Bearer ' + tokens.access_token } });
    const google = await userResponse.json();
    if (!userResponse.ok || google.email_verified !== true || !google.email || !google.sub) return fail('Use a Google account with a verified email address.');
    const email = String(google.email).trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Google returned an invalid email address.');
    const sql = db();
    let rows = await sql`SELECT id, email, display_name, role, status FROM profiles WHERE lower(email) = ${email} LIMIT 1`;
    let profile = rows[0];
    if (profile && profile.status !== 'active') return fail('This Adlink account is not active. Contact support.');
    if (!profile) {
      const displayName = String(google.name || google.given_name || email.split('@')[0]).trim().slice(0, 100) || 'Adlink member';
      try {
        rows = await sql`
          WITH new_profile AS (
            INSERT INTO profiles (email, display_name, role, status)
            VALUES (${email}, ${displayName}, ${pending.role}, 'active')
            RETURNING id, email, display_name, role, status
          ), new_publisher AS (
            INSERT INTO publisher_profiles (profile_id, business_name, verification_status)
            SELECT id, ${displayName}, 'pending' FROM new_profile WHERE role = 'publisher'
            RETURNING profile_id
          )
          SELECT id, email, display_name, role, status FROM new_profile
        `;
        profile = rows[0];
      } catch (error) {
        if (error?.code !== '23505') throw error;
        rows = await sql`SELECT id, email, display_name, role, status FROM profiles WHERE lower(email) = ${email} LIMIT 1`;
        profile = rows[0];
        if (!profile || profile.status !== 'active') return fail('This Adlink account could not be linked. Contact support.');
      }
    }
    // Existing account roles are intentionally preserved. Google login never upgrades or downgrades roles.
    const token = await createSession(profile);
    return redirect(profile.role === 'super_admin' ? '/admin' : '/dashboard', [cookieHeader(token, request)]);
  } catch (error) {
    console.error('Google OAuth callback failed', { message: error?.message, code: error?.code });
    return fail('Google sign-in is temporarily unavailable. Please try again.');
  }
}
