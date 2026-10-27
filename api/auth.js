import { createSession, getDb, getSession, hashPassword, json, readCookie, sameOrigin, sessionCookie, tokenHash, verifyPassword } from '../lib/server-auth.js';

export default async function handler(request) {
  if (!['GET','POST'].includes(request.method)) return json({ error: 'Method not allowed' }, 405, { allow: 'GET, POST' });
  if (!sameOrigin(request)) return json({ error: 'Cross-origin request blocked.' }, 403);
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || (request.method === 'GET' ? 'me' : '');
  let sql;
  try { sql = getDb(); } catch { return json({ error: 'Authentication service is not configured.' }, 503); }

  if (action === 'me' && request.method === 'GET') {
    try {
      const user = await getSession(request, sql);
      return user ? json({ user }) : json({ user: null }, 401);
    } catch (error) {
      console.error('Auth session lookup failed', { message: error?.message });
      return json({ error: 'Could not verify your session.' }, 500);
    }
  }

  if (action === 'logout' && request.method === 'POST') {
    const token = readCookie(request, 'adlink_session');
    try {
      if (token) await sql`DELETE FROM auth_sessions WHERE token_hash = ${tokenHash(token)}`;
      return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
    } catch (error) {
      console.error('Logout failed', { message: error?.message });
      return json({ error: 'Could not end the session.' }, 500);
    }
  }

  if (!['register','login'].includes(action) || request.method !== 'POST') return json({ error: 'Unknown authentication action.' }, 404);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Provide a valid JSON body.' }, 400); }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: 'Enter a valid email address.' }, 400);
  if (password.length < 12 || password.length > 200) return json({ error: 'Password must be between 12 and 200 characters.' }, 400);

  try {
    if (action === 'register') {
      const displayName = typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 100) : '';
      const role = body.role === 'publisher' ? 'publisher' : body.role === 'advertiser' ? 'advertiser' : '';
      if (!displayName || !role) return json({ error: 'Name and a valid advertiser or publisher account type are required.' }, 400);
      const existing = await sql`SELECT id FROM profiles WHERE email = ${email} LIMIT 1`;
      if (existing.length) return json({ error: 'An account with this email already exists. Try signing in.' }, 409);
      const passwordHash = hashPassword(password);
      const created = await sql`
        INSERT INTO profiles (email, display_name, role, status, password_hash)
        VALUES (${email}, ${displayName}, ${role}, 'active', ${passwordHash})
        RETURNING id, email, display_name, role, status, phone
      `;
      const user = created[0];
      if (role === 'publisher') {
        const businessName = typeof body.businessName === 'string' && body.businessName.trim() ? body.businessName.trim().slice(0, 120) : displayName;
        await sql`INSERT INTO publisher_profiles (profile_id, business_name) VALUES (${user.id}, ${businessName})`;
      }
      const token = await createSession(sql, user.id);
      return json({ user }, 201, { 'set-cookie': sessionCookie(token) });
    }

    const rows = await sql`SELECT id, email, display_name, role, status, phone, password_hash FROM profiles WHERE email = ${email} LIMIT 1`;
    const user = rows[0];
    if (!user || !verifyPassword(password, user.password_hash) || user.status !== 'active') {
      return json({ error: 'Email or password is incorrect, or this account is not active.' }, 401);
    }
    const token = await createSession(sql, user.id);
    const { password_hash, ...safeUser } = user;
    return json({ user: safeUser }, 200, { 'set-cookie': sessionCookie(token) });
  } catch (error) {
    console.error('Authentication request failed', { action, message: error?.message });
    return json({ error: 'Could not complete authentication. Please try again.' }, 500);
  }
}
