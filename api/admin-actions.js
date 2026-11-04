import { vercelHandler } from '../lib/vercel-handler.js';
import { db, json, requireSession, checkSameOrigin } from '../lib/auth.js';
import { adminUsersHandler } from '../lib/admin-users.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function handler(request) {
  if (new URL(request.url).searchParams.get('action') === 'users') return adminUsersHandler(request);
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'POST' });
  if (!checkSameOrigin(request)) return json({ error: 'Cross-origin request rejected.' }, 403);
  const auth = await requireSession(request, ['super_admin']);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const entity = ['publisher','placement','user','payout'].includes(body.entity) ? body.entity : '';
    const action = ['approve','reject','suspend','reactivate','mark_paid'].includes(body.action) ? body.action : '';
    const id = String(body.id || '');
    const validAction = entity === 'publisher' || entity === 'placement' ? ['approve','reject'].includes(action) : entity === 'user' ? ['suspend','reactivate'].includes(action) : entity === 'payout' ? ['approve','reject','mark_paid'].includes(action) : false;
    if (!entity || !validAction || !UUID.test(id)) return json({ error: 'Choose a valid review action and record.' }, 400);
    if (entity === 'user' && id === auth.profile.id) return json({ error: 'You cannot change your own account status from this screen.' }, 400);

    const sql = db();
    let rows;
    if (entity === 'publisher') {
      rows = action === 'approve'
        ? await sql`UPDATE publisher_profiles SET verification_status='verified', updated_at=now() WHERE id=${id} AND verification_status IN ('unverified','pending') RETURNING id, business_name, verification_status`
        : await sql`UPDATE publisher_profiles SET verification_status='rejected', updated_at=now() WHERE id=${id} AND verification_status IN ('unverified','pending') RETURNING id, business_name, verification_status`;
    } else if (entity === 'placement') {
      rows = action === 'approve'
        ? await sql`UPDATE placements SET status='published', verified_at=now(), updated_at=now() WHERE id=${id} AND status='pending_review' RETURNING id, title, status`
        : await sql`UPDATE placements SET status='rejected', updated_at=now() WHERE id=${id} AND status='pending_review' RETURNING id, title, status`;
    } else if (entity === 'user') {
      rows = action === 'suspend'
        ? await sql`UPDATE profiles SET status='suspended', updated_at=now() WHERE id=${id} AND status='active' AND role <> 'super_admin' RETURNING id, email, role, status`
        : await sql`UPDATE profiles SET status='active', updated_at=now() WHERE id=${id} AND status='suspended' AND role <> 'super_admin' RETURNING id, email, role, status`;
    } else {
      if (action === 'mark_paid') {
        const reference = String(body.payout_reference || '').trim();
        if (reference.length < 4 || reference.length > 120) return json({ error: 'Enter a valid bank or transfer reference before marking paid.' }, 400);
        rows = await sql`WITH item_status AS (
          SELECT pr.id,
            count(pri.earning_id)::int AS item_count,
            count(pe.id) FILTER (WHERE pe.status='available')::int AS available_count
          FROM payout_requests pr
          JOIN payout_request_items pri ON pri.payout_request_id=pr.id
          LEFT JOIN publisher_earnings pe ON pe.id=pri.earning_id
          WHERE pr.id=${id}
          GROUP BY pr.id
        ), paid_request AS (
          UPDATE payout_requests SET status='paid', payout_reference=${reference}, paid_at=now(), reviewed_by=${auth.profile.id}, reviewed_at=now(), updated_at=now()
          WHERE id=${id} AND status='approved'
            AND EXISTS (SELECT 1 FROM item_status WHERE item_count > 0 AND item_count=available_count)
          RETURNING id, amount_minor, status, payout_reference, paid_at
        ), settled AS (
          UPDATE publisher_earnings SET status='paid', updated_at=now()
          WHERE status='available'
            AND id IN (SELECT pri.earning_id FROM payout_request_items pri JOIN paid_request pr ON pr.id=pri.payout_request_id)
          RETURNING id
        )
        SELECT paid_request.* FROM paid_request
        WHERE (SELECT count(*) FROM settled)=(SELECT item_count FROM item_status)`;
      } else if (action === 'approve') {
        rows = await sql`UPDATE payout_requests SET status='approved', reviewed_by=${auth.profile.id}, reviewed_at=now(), updated_at=now() WHERE id=${id} AND status='requested' RETURNING id, amount_minor, status`;
      } else {
        rows = await sql`WITH rejected AS (
          UPDATE payout_requests SET status='rejected', reviewed_by=${auth.profile.id}, reviewed_at=now(), updated_at=now()
          WHERE id=${id} AND status='requested'
          RETURNING id, amount_minor, status
        ), released AS (
          DELETE FROM payout_request_items
          WHERE payout_request_id IN (SELECT id FROM rejected)
          RETURNING earning_id
        )
        SELECT rejected.* FROM rejected`;
      }
    }
    if (!rows.length) return json({ error: 'Record was not found in the expected status. Refresh and try again.' }, 409);

    await sql`INSERT INTO audit_logs (actor_profile_id, action, entity_type, entity_id, details) VALUES (${auth.profile.id}, ${action}, ${entity}, ${id}, ${JSON.stringify({ result: rows[0] })}::jsonb)`;
    return json({ success: true, record: rows[0] });
  } catch (error) {
    console.error('Admin review action failed', { message: error?.message, code: error?.code });
    return json({ error: 'Could not complete the review action.' }, 500);
  }
}

export default vercelHandler(handler);
