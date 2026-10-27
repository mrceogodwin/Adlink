import {
  getDb, getSession, hashPassword as hashPasswordSync, verifyPassword as verifyPasswordSync,
  json, sameOrigin, sessionCookie, createSession as createStoredSession, readCookie, tokenHash
} from './server-auth.js';

export const db = getDb;
export const checkSameOrigin = sameOrigin;
export const hashPassword = async password => hashPasswordSync(password);
export const verifyPassword = async (password, stored) => verifyPasswordSync(password, stored);

export function cookieHeader(token, request, maxAge = 60 * 60 * 24 * 7) {
  return sessionCookie(token, maxAge);
}

export async function createSession(profile) {
  const sql = getDb();
  return createStoredSession(sql, profile.id);
}

export async function destroySession(request) {
  const token = readCookie(request, 'adlink_session');
  if (!token) return;
  const sql = getDb();
  await sql`DELETE FROM auth_sessions WHERE token_hash = ${tokenHash(token)}`;
}

export async function requireSession(request, roles = []) {
  try {
    const sql = getDb();
    const profile = await getSession(request, sql);
    if (!profile) return { error: json({ error: 'Sign in required.' }, 401) };
    if (roles.length && !roles.includes(profile.role)) {
      return { error: json({ error: 'You are not allowed to access this resource.' }, 403) };
    }
    return { profile };
  } catch (error) {
    console.error('Session verification failed', { message: error?.message });
    return { error: json({ error: 'Authentication service is unavailable.' }, 503) };
  }
}

export const SESSION_COOKIE = 'adlink_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
