import { neon } from '@neondatabase/serverless';
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const COOKIE = 'adlink_session';
const SESSION_SECONDS = 60 * 60 * 24 * 7;

export function db() {
  if (!process.env.DATABASE_URL) throw new Error('Database is not configured');
  return neon(process.env.DATABASE_URL);
}

function secret() {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 48) {
    throw new Error('Session signing secret is not configured');
  }
  return process.env.SESSION_SECRET;
}

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders },
  });
}

export function checkSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export function cookieHeader(token, request, maxAge = SESSION_SECONDS) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${Buffer.from(derived).toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [algorithm, salt, hash] = stored.split(':');
  if (algorithm !== 'scrypt' || !salt || !hash || !/^[a-f0-9]{128}$/i.test(hash)) return false;
  const derived = Buffer.from(await scrypt(password, salt, 64));
  const expected = Buffer.from(hash, 'hex');
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

function sign(value) {
  return createHmac('sha256', secret()).update(value).digest('base64url');
}

export function createSession(profile) {
  const payload = Buffer.from(JSON.stringify({
    sub: profile.id,
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function readCookie(request) {
  const raw = request.headers.get('cookie') || '';
  const match = raw.split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE + '='));
  return match ? decodeURIComponent(match.slice(COOKIE.length + 1)) : '';
}

export async function requireSession(request, roles = []) {
  const token = readCookie(request);
  if (!token) return { error: json({ error: 'Sign in required.' }, 401) };
  try {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra) return { error: json({ error: 'Invalid session.' }, 401) };
    const expected = sign(payload);
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) return { error: json({ error: 'Invalid session.' }, 401) };
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!decoded.sub || !Number.isInteger(decoded.exp) || decoded.exp < Math.floor(Date.now() / 1000)) {
      return { error: json({ error: 'Session expired.' }, 401) };
    }
    const sql = db();
    const rows = await sql`SELECT id, email, display_name, role, status FROM profiles WHERE id = ${decoded.sub} LIMIT 1`;
    const profile = rows[0];
    if (!profile || profile.status !== 'active') return { error: json({ error: 'This account is not active.' }, 403) };
    if (roles.length && !roles.includes(profile.role)) return { error: json({ error: 'You are not allowed to access this resource.' }, 403) };
    return { profile };
  } catch (error) {
    if (error?.message === 'Session signing secret is not configured' || error?.message === 'Database is not configured') {
      return { error: json({ error: 'Authentication is not configured on this deployment.' }, 503) };
    }
    return { error: json({ error: 'Invalid session.' }, 401) };
  }
}

export const SESSION_COOKIE = COOKIE;
export const SESSION_MAX_AGE = SESSION_SECONDS;
