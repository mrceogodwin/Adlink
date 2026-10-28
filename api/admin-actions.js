import { vercelHandler } from '../lib/vercel-handler.js';
import { db, json, requireSession, checkSameOrigin } from '../lib/auth.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function handler(request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'POST' });
  if (!checkSameOrigin(request)) return json({ error: 'Cross-origin request rejected.' }, 403);
  const auth = await requireSession(request, ['super_admin']);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const entity = body.entity === 'publisher' || body.entity === 'placement' ? body.entity : '';
    const action = body.action === 'approve' || body.action === 'reject' ? body.action : '';
    const id = String(body.id || '');
    if (!entity || !action || !UUID.test(id)) return json({ error: 'Choose a valid review action and record.' }, 400);

    const sql = db();
    let rows;
    if (entity === 'publisher') {
      rows = action === 'approve'
        ? await sql`UPDATE publisher_profiles SET verification_status='verified', updated_at=now() WHERE id=${id} AND verification_status IN ('unverified','pending') RETURNING id, business_name, verification_status`
        : await sql`UPDATE publisher_profiles SET verification_status='rejected', updated_at=now() WHERE id=${id} AND verification_status IN ('unverified','pending') RETURNING id, business_name, verification_status`;
    } else {
      rows = action === 'approve'
        ? await sql`UPDATE placements SET status='published', verified_at=now(), updated_at=now() WHERE id=${id} AND status='pending_review' RETURNING id, title, status`
        : await sql`UPDATE placements SET status='rejected', updated_at=now() WHERE id=${id} AND status='pending_review' RETURNING id, title, status`;
    }
    if (!rows.length) return json({ error: 'Record was not found in the pending review queue. Refresh and try again.' }, 409);

    await sql`INSERT INTO audit_logs (actor_profile_id, action, entity_type, entity_id, details) VALUES (${auth.profile.id}, ${action}, ${entity}, ${id}, ${JSON.stringify({ result: rows[0] })}::jsonb)`;
    return json({ success: true, record: rows[0] });
  } catch (error) {
    console.error('Admin review action failed', { message: error?.message, code: error?.code });
    return json({ error: 'Could not complete the review action.' }, 500);
  }
}

export default vercelHandler(handler);
