import { db, json, checkSameOrigin, hashPassword, createSession, cookieHeader } from '../../lib/auth.js';

export default async function handler(request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'POST' });
  if (!checkSameOrigin(request)) return json({ error: 'Cross-origin request rejected.' }, 403);
  if (!process.env.SESSION_SECRET || !process.env.DATABASE_URL) return json({ error: 'Account registration is not configured yet.' }, 503);
  try {
    const body = await request.json();
    const displayName = String(body.displayName || '').trim().slice(0, 100);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const role = body.role === 'publisher' ? 'publisher' : body.role === 'advertiser' ? 'advertiser' : '';
    if (displayName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return json({ error: 'Enter your name and a valid email address.' }, 400);
    }
    if (password.length < 12 || password.length > 200) return json({ error: 'Use a password between 12 and 200 characters.' }, 400);
    if (!role) return json({ error: 'Choose advertiser or publisher. Admin accounts cannot be created here.' }, 400);
    const passwordHash = await hashPassword(password);
    const sql = db();
    const rows = await sql`
      WITH new_profile AS (
        INSERT INTO profiles (email, display_name, role, status)
        VALUES (${email}, ${displayName}, ${role}, 'active')
        RETURNING id, email, display_name, role, status
      ), new_credential AS (
        INSERT INTO auth_credentials (profile_id, password_hash)
        SELECT id, ${passwordHash} FROM new_profile
        RETURNING profile_id
      ), new_publisher AS (
        INSERT INTO publisher_profiles (profile_id, business_name, verification_status)
        SELECT id, ${displayName}, 'pending' FROM new_profile WHERE role = 'publisher'
        RETURNING profile_id
      )
      SELECT id, email, display_name, role, status FROM new_profile
    `;
    const profile = rows[0];
    if (!profile) return json({ error: 'Could not create the account.' }, 500);
    return json({ profile }, 201, { 'set-cookie': cookieHeader(createSession(profile), request) });
  } catch (error) {
    if (error?.code === '23505') return json({ error: 'An account with this email already exists. Try logging in.' }, 409);
    console.error('Registration failed', { message: error?.message, code: error?.code });
    return json({ error: 'Registration failed. Please try again.' }, 500);
  }
}
