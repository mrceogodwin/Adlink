import { vercelHandler } from '../lib/vercel-handler.js';
import { db, json, requireSession, checkSameOrigin } from '../lib/auth.js';

async function handler(request) {
  const auth = await requireSession(request, ['publisher']);
  if (auth.error) return auth.error;
  const sql = db();
  if (request.method === 'GET') {
    try {
      const rows = await sql`SELECT id FROM publisher_profiles WHERE profile_id=${auth.profile.id} LIMIT 1`;
      if (!rows.length) return json({ error: 'Publisher profile not found.' }, 404);
      const [balances, requests] = await Promise.all([
        sql`SELECT CASE WHEN status='available' AND EXISTS (SELECT 1 FROM payout_request_items pri JOIN payout_requests pr ON pr.id=pri.payout_request_id WHERE pri.earning_id=publisher_earnings.id AND pr.status IN ('requested','approved','processing')) THEN 'reserved' ELSE status END AS status, coalesce(sum(net_amount_minor),0)::bigint AS amount_minor, count(*)::int AS entries FROM publisher_earnings WHERE publisher_id=${rows[0].id} GROUP BY 1`,
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
    const created = await sql`WITH publisher_lock AS MATERIALIZED (
      SELECT pg_advisory_xact_lock(hashtextextended(${profile[0].id}::text, 0)) AS acquired
    ), locked AS MATERIALIZED (
      SELECT pe.id, pe.net_amount_minor FROM publisher_earnings pe
      CROSS JOIN publisher_lock
      WHERE pe.publisher_id=${profile[0].id} AND pe.status='available' AND NOT EXISTS (SELECT 1 FROM payout_request_items pri JOIN payout_requests pr ON pr.id=pri.payout_request_id WHERE pri.earning_id=pe.id AND pr.status IN ('requested','approved','processing'))
      ORDER BY pe.available_at NULLS LAST, pe.created_at, pe.id
      FOR UPDATE OF pe
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
    )
    SELECT request_row.* FROM request_row
    WHERE (SELECT count(*) FROM linked)=(SELECT count(*) FROM locked)`;
    if (!created.length) return json({ error: 'Insufficient available balance. For now, withdrawals must equal the full available balance.' }, 409);
    await sql`INSERT INTO audit_logs(actor_profile_id,action,entity_type,entity_id,details) VALUES (${auth.profile.id},'payout_requested','payout_request',${created[0].id},${JSON.stringify({ amount_minor: amountMinor })}::jsonb)`;
    return json({ payout_request: created[0] }, 201);
  } catch (error) {
    console.error('Payout request failed', { message: error?.message, code: error?.code });
    return json({ error: 'Could not submit payout request.' }, 500);
  }
}

export default vercelHandler(handler);
