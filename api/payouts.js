import { vercelHandler } from '../lib/vercel-handler.js';
import { db, json, requireSession, checkSameOrigin } from '../lib/auth.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function handler(request) {
  const auth = await requireSession(request, ['publisher']);
  if (auth.error) return auth.error;
  const sql = db();
  if (request.method === 'GET') {
    try {
      const rows = await sql`SELECT id FROM publisher_profiles WHERE profile_id=${auth.profile.id} LIMIT 1`;
      if (!rows.length) return json({ error: 'Publisher profile not found.' }, 404);
      const [balances, requests] = await Promise.all([
        sql`SELECT status, coalesce(sum(net_amount_minor),0)::bigint AS amount_minor, count(*)::int AS entries FROM publisher_earnings WHERE publisher_id=${rows[0].id} GROUP BY status`,
        sql`SELECT id, amount_minor, currency, status, requested_at, reviewed_at, paid_at, admin_note FROM payout_requests WHERE publisher_id=${rows[0].id} ORDER BY requested_at DESC LIMIT 50`
      ]);
      return json({ balances, requests });
    } catch (error) {
      console.error('Publisher payout summary failed', { message: error?.message, code: error?.code });
      return json({ error: 'Could not load payout information.' }, 500);
    }
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'GET, POST' });
  if (!checkSameOrigin(request)) return json({ error: 'Cross-origin request rejected.' }, 403);
  try {
    const body = await request.json();
    const amountMinor = Number(body.amount_minor);
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 100) return json({ error: 'Enter a withdrawal amount of at least ₦1.00.' }, 400);
    const profile = await sql`SELECT id FROM publisher_profiles WHERE profile_id=${auth.profile.id} AND verification_status='verified' LIMIT 1`;
    if (!profile.length) return json({ error: 'A verified publisher profile is required to request a payout.' }, 403);
    const created = await sql`WITH locked AS MATERIALIZED (
      SELECT id, net_amount_minor FROM publisher_earnings
      WHERE publisher_id=${profile[0].id} AND status='available'
      ORDER BY available_at NULLS LAST, created_at, id
      FOR UPDATE
    ), total AS (
      SELECT coalesce(sum(net_amount_minor),0)::bigint AS amount_minor FROM locked
    ), request_row AS (
      INSERT INTO payout_requests(publisher_id,amount_minor,currency,status)
      SELECT ${profile[0].id},${amountMinor},'NGN','requested'
      FROM total WHERE amount_minor=${amountMinor}
      RETURNING id, amount_minor, currency, status, requested_at
    ), linked AS (
      INSERT INTO payout_request_items(payout_request_id,earning_id)
      SELECT request_row.id, locked.id FROM request_row CROSS JOIN locked
      RETURNING earning_id
    ), reserved AS (
      UPDATE publisher_earnings SET status='pending', updated_at=now()
      WHERE id IN (SELECT earning_id FROM linked)
      RETURNING id
    )
    SELECT request_row.* FROM request_row WHERE (SELECT count(*) FROM reserved)=(SELECT count(*) FROM locked)`;
    if (!created.length) return json({ error: 'Insufficient available balance or payout request could not be reserved.' }, 409);
    await sql`INSERT INTO audit_logs(actor_profile_id,action,entity_type,entity_id,details) VALUES (${auth.profile.id},'payout_requested','payout_request',${created[0].id},${JSON.stringify({ amount_minor: amountMinor })}::jsonb)`;
    return json({ payout_request: created[0] }, 201);
  } catch (error) {
    console.error('Payout request failed', { message: error?.message, code: error?.code });
    return json({ error: 'Could not submit payout request.' }, 500);
  }
}

export default vercelHandler(handler);
