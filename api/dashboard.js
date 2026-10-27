import { db, json, requireSession } from '../lib/auth.js';

export default async function handler(request) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, { allow: 'GET' });

  const session = await requireSession(request);
  if (session.error) return session.error;

  try {
    const user = session.profile;
    const sql = db();

    if (user.role === 'super_admin' || user.role === 'admin') {
      const rows = await sql`
        SELECT
          (SELECT count(*)::int FROM profiles) AS users,
          (SELECT count(*)::int FROM publisher_profiles) AS publishers,
          (SELECT count(*)::int FROM placements) AS placements,
          (SELECT count(*)::int FROM bookings) AS bookings,
          (SELECT count(*)::int FROM campaigns) AS campaigns,
          (SELECT count(*)::int FROM payment_events WHERE status = 'successful') AS successful_payments
      `;
      return json({ user, role: 'admin', stats: rows[0] });
    }

    if (user.role === 'publisher') {
      const rows = await sql`
        SELECT pp.id AS publisher_id, pp.business_name, pp.verification_status,
          (SELECT count(*)::int FROM placements p WHERE p.publisher_id = pp.id) AS placements,
          (SELECT count(*)::int FROM placements p WHERE p.publisher_id = pp.id AND p.status = 'published') AS published_placements,
          (SELECT count(*)::int FROM bookings b WHERE b.publisher_id = pp.id) AS bookings,
          (SELECT count(*)::int FROM bookings b WHERE b.publisher_id = pp.id AND b.status IN ('paid','in_progress','submitted_for_review')) AS active_bookings
        FROM publisher_profiles pp WHERE pp.profile_id = ${user.id} LIMIT 1
      `;
      return json({ user, role: 'publisher', stats: rows[0] || null });
    }

    const rows = await sql`
      SELECT
        (SELECT count(*)::int FROM campaigns c WHERE c.advertiser_id = ${user.id}) AS campaigns,
        (SELECT count(*)::int FROM bookings b WHERE b.advertiser_id = ${user.id}) AS bookings,
        (SELECT count(*)::int FROM bookings b WHERE b.advertiser_id = ${user.id} AND b.status IN ('paid','in_progress','submitted_for_review')) AS active_bookings,
        (SELECT coalesce(sum(amount_minor),0)::bigint FROM bookings b WHERE b.advertiser_id = ${user.id} AND b.status NOT IN ('cancelled','declined')) AS booked_spend,
        (SELECT count(*)::int FROM saved_placements s WHERE s.profile_id = ${user.id}) AS saved_placements
    `;
    return json({ user, role: 'advertiser', stats: rows[0] });
  } catch (error) {
    console.error('Dashboard API failed', { message: error?.message });
    return json({ error: 'Could not load dashboard data.' }, 500);
  }
}
