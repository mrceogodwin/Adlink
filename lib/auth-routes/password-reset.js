import { createHash } from 'node:crypto';
import { db, json, checkSameOrigin, hashPassword } from '../auth.js';

export default async function handler(request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'POST' });
  if (!checkSameOrigin(request)) return json({ error: 'Cross-origin request rejected.' }, 403);
  try {
    const body = await request.json();
    const token = String(body.token || '');
    const password = String(body.password || '');
    if (!/^[a-f0-9]{64}$/i.test(token)) return json({ error: 'This reset link is invalid or has expired. Request a new one.' }, 400);
    if (password.length < 12 || password.length > 200) return json({ error: 'Use a password between 12 and 200 characters.' }, 400);
    const passwordHash = await hashPassword(password);
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const sql = db();
    const rows = await sql`
      WITH consumed AS (
        UPDATE password_reset_tokens
        SET used_at=now()
        WHERE token_hash=${tokenHash} AND used_at IS NULL AND expires_at > now()
        RETURNING profile_id
      ), credential AS (
        UPDATE auth_credentials
        SET password_hash=${passwordHash}, updated_at=now()
        WHERE profile_id IN (SELECT profile_id FROM consumed)
        RETURNING profile_id
      ), revoked AS (
        DELETE FROM auth_sessions
        WHERE profile_id IN (SELECT profile_id FROM credential)
        RETURNING profile_id
      )
      SELECT p.id, p.email, p.role
      FROM profiles p JOIN credential c ON c.profile_id=p.id
      WHERE p.role='super_admin' AND p.status='active'
    `;
    if (!rows.length) return json({ error: 'This reset link is invalid, expired, or not authorized for this account.' }, 400);
    return json({ success: true, message: 'Password updated. Sign in with your new password.' });
  } catch (error) {
    console.error('Password reset failed', { message: error?.message, code: error?.code });
    return json({ error: 'Password reset is temporarily unavailable.' }, 500);
  }
}
