import { db, json, checkSameOrigin, verifyPassword, createSession, cookieHeader } from '../auth.js';

export default async function handler(request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'POST' });
  if (!checkSameOrigin(request)) return json({ error: 'Cross-origin request rejected.' }, 403);
  if (!process.env.DATABASE_URL) return json({ error: 'Login is not configured yet.' }, 503);
  try {
    const body = await request.json();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!email || !password || email.length > 254 || password.length > 200) return json({ error: 'Enter your email and password.' }, 400);
    const sql = db();
    const rows = await sql`
      SELECT p.id, p.email, p.display_name, p.role, p.status, c.password_hash
      FROM profiles p JOIN auth_credentials c ON c.profile_id = p.id
      WHERE p.email = ${email} LIMIT 1
    `;
    const row = rows[0];
    const valid = await verifyPassword(password, row?.password_hash || 'invalid');
    if (!row || !valid) return json({ error: 'Email or password is incorrect.' }, 401);
    if (row.status !== 'active') return json({ error: 'This account is not active. Contact Adlink support.' }, 403);
    const profile = { id: row.id, email: row.email, display_name: row.display_name, role: row.role, status: row.status };
    const token = await createSession(profile);
    return json({ profile }, 200, { 'set-cookie': cookieHeader(token, request) });
  } catch (error) {
    console.error('Login failed', { message: error?.message, code: error?.code });
    return json({ error: 'Login is temporarily unavailable.' }, 500);
  }
}
