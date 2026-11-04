import { db, json, requireSession, checkSameOrigin } from '../lib/auth.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function adminUsersHandler(request) {
  const auth = await requireSession(request, ['super_admin']);
  if (auth.error) return auth.error;
  const sql = db();

  if (request.method === 'GET') {
    try {
      const url = new URL(request.url);
      const search = (url.searchParams.get('q') || '').trim().slice(0, 100);
      const status = ['active', 'pending', 'suspended'].includes(url.searchParams.get('status')) ? url.searchParams.get('status') : '';
      const rows = await sql`
        SELECT id, email, display_name, role, status, created_at
        FROM profiles
        WHERE role <> 'super_admin'
          AND (${search} = '' OR email ILIKE ${'%' + search + '%'} OR display_name ILIKE ${'%' + search + '%'})
          AND (${status} = '' OR status = ${status})
        ORDER BY created_at DESC
        LIMIT 100
      `;
      return json({ data: rows });
    } catch (error) {
      console.error('Admin user list failed', { message: error?.message, code: error?.code });
      return json({ error: 'Could not load user accounts.' }, 500);
    }
  }

  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'GET, POST' });
  if (!checkSameOrigin(request)) return json({ error: 'Cross-origin request rejected.' }, 403);
  try {
    const body = await request.json();
    const id = String(body.id || '');
    const status = body.status === 'active' || body.status === 'suspended' ? body.status : '';
    if (!UUID.test(id) || !status) return json({ error: 'Choose a valid account and status.' }, 400);
    if (id === auth.profile.id) return json({ error: 'You cannot suspend or change your own owner account here.' }, 403);

    const rows = await sql`
      UPDATE profiles
      SET status = ${status}, updated_at = now()
      WHERE id = ${id} AND role <> 'super_admin'
      RETURNING id, email, display_name, role, status
    `;
    if (!rows.length) return json({ error: 'Account not found or protected.' }, 404);
    await sql`
      INSERT INTO audit_logs (actor_profile_id, action, entity_type, entity_id, details)
      VALUES (${auth.profile.id}, ${status === 'suspended' ? 'user_suspended' : 'user_reactivated'}, 'profile', ${id}, ${JSON.stringify({ status })}::jsonb)
    `;
    return json({ success: true, user: rows[0] });
  } catch (error) {
    console.error('Admin user update failed', { message: error?.message, code: error?.code });
    return json({ error: 'Could not update this account.' }, 500);
  }
}

