import { createHash, randomBytes } from 'node:crypto';
import { db, json, checkSameOrigin } from '../auth.js';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

export default async function handler(request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'POST' });
  if (!checkSameOrigin(request)) return json({ error: 'Cross-origin request rejected.' }, 403);
  try {
    const body = await request.json();
    const email = String(body.email || '').trim().toLowerCase();
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'Enter a valid email address.' }, 400);
    }
    if (!process.env.RESEND_API_KEY) {
      console.error('Password reset email unavailable: RESEND_API_KEY is not configured.');
      return json({ error: 'Password reset email is not configured yet. Please contact support.' }, 503);
    }

    const sql = db();
    const rows = await sql`
      SELECT p.id, p.email, p.display_name
      FROM profiles p
      JOIN auth_credentials c ON c.profile_id = p.id
      WHERE lower(p.email) = ${email}
        AND p.role = 'super_admin'
        AND p.status = 'active'
      LIMIT 1
    `;
    // Always return the same success response for unknown/non-admin email addresses.
    if (!rows.length) return json({ success: true, message: 'If the account is eligible, a reset link will be sent shortly.' });

    const profile = rows[0];
    const recent = await sql`
      SELECT count(*)::int AS count
      FROM password_reset_tokens
      WHERE profile_id = ${profile.id}
        AND created_at > now() - interval '15 minutes'
    `;
    if (Number(recent[0]?.count || 0) >= 3) {
      return json({ success: true, message: 'If the account is eligible, a reset link will be sent shortly.' });
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await sql`
      UPDATE password_reset_tokens
      SET used_at = now()
      WHERE profile_id = ${profile.id} AND used_at IS NULL
    `;
    await sql`
      INSERT INTO password_reset_tokens (profile_id, token_hash, expires_at)
      VALUES (${profile.id}, ${tokenHash}, now() + interval '30 minutes')
    `;

    const origin = process.env.APP_URL || new URL(request.url).origin;
    const resetUrl = new URL('/reset-password', origin);
    resetUrl.searchParams.set('token', token);
    const displayName = escapeHtml(profile.display_name || 'there');
    const from = process.env.RESEND_FROM_EMAIL || 'Adlink <onboarding@resend.dev>';
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + process.env.RESEND_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: [profile.email],
        subject: 'Reset your Adlink Super Admin password',
        html: '<div style="font-family:Arial,sans-serif;max-width:560px;margin:32px auto;color:#171717;line-height:1.6">' +
          '<h2>Reset your Adlink password</h2>' +
          '<p>Hello ' + displayName + ',</p>' +
          '<p>We received a request to reset the password for your Adlink Super Admin account.</p>' +
          '<p><a href="' + resetUrl.toString() + '" style="display:inline-block;background:#111;color:#fff;padding:13px 20px;border-radius:8px;text-decoration:none">Reset password</a></p>' +
          '<p>This link expires in 30 minutes and can only be used once. If you did not request this, you can ignore this email.</p>' +
          '<p>Adlink Security</p></div>',
        text: 'Hello ' + (profile.display_name || 'there') + ',\n\nReset your Adlink Super Admin password using this link: ' + resetUrl.toString() + '\n\nThis link expires in 30 minutes and can only be used once. If you did not request this, ignore this email.'
      })
    });
    if (!emailResponse.ok) {
      const detail = await emailResponse.text().catch(() => '');
      console.error('Resend rejected password reset email', { status: emailResponse.status, detail: detail.slice(0, 300) });
      await sql`UPDATE password_reset_tokens SET used_at = now() WHERE token_hash = ${tokenHash} AND used_at IS NULL`;
      return json({ error: 'We could not send the reset email right now. Please try again later.' }, 502);
    }
    return json({ success: true, message: 'If the account is eligible, a reset link will be sent shortly.' });
  } catch (error) {
    console.error('Password reset request failed', { message: error?.message, code: error?.code });
    return json({ error: 'Password reset is temporarily unavailable.' }, 500);
  }
}
