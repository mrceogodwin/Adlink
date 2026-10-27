import { neon } from '@neondatabase/serverless';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders },
  });
}
export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  return neon(url);
}
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = scryptSync(password, salt, 64).toString('hex');
  return 'scrypt$' + salt + '$' + key;
}
export function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  try {
    const expected = Buffer.from(parts[2], 'hex');
    const actual = scryptSync(password, parts[1], expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch { return false; }
}
export function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}
export function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  const match = header.split(';').map(v => v.trim()).find(v => v.startsWith(name + '='));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}
export async function getSession(request, sql = getDb()) {
  const token = readCookie(request, 'adlink_session');
  if (!token || token.length < 32 || token.length > 200) return null;
  const rows = await sql`
    SELECT p.id, p.email, p.display_name, p.role, p.status, p.phone
    FROM auth_sessions s JOIN profiles p ON p.id = s.profile_id
    WHERE s.token_hash = ${tokenHash(token)} AND s.expires_at > now()
    LIMIT 1
  `;
  const user = rows[0];
  if (!user || user.status !== 'active') return null;
  return user;
}
export function sessionCookie(token, maxAge = 604800) {
  return 'adlink_session=' + encodeURIComponent(token) + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + maxAge;
}
export async function createSession(sql, profileId) {
  const token = randomBytes(32).toString('base64url');
  await sql`INSERT INTO auth_sessions (profile_id, token_hash, expires_at) VALUES (${profileId}, ${tokenHash(token)}, now() + interval '7 days')`;
  return token;
}
export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}
