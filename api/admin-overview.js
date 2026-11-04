import { vercelHandler } from '../lib/vercel-handler.js';
import { db, json, requireSession } from '../lib/auth.js';

async function handler(request) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, { allow: 'GET' });
  const auth = await requireSession(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const sql = db();
    const [stats, pendingPublishers, pendingPlacements, recentAudit, users, recentBookings, recentPayments, revenueByMonth, publisherPayoutProfiles] = await Promise.all([
      sql`SELECT
        (SELECT count(*)::int FROM profiles) AS users,
        (SELECT count(*)::int FROM profiles WHERE role='advertiser') AS advertisers,
        (SELECT count(*)::int FROM publisher_profiles) AS publishers,
        (SELECT count(*)::int FROM publisher_profiles WHERE verification_status IN ('unverified','pending')) AS pending_publishers,
        (SELECT count(*)::int FROM placements) AS placements,
        (SELECT count(*)::int FROM placements WHERE status='pending_review') AS pending_placements,
        (SELECT count(*)::int FROM bookings WHERE status NOT IN ('completed','cancelled','declined')) AS open_bookings,
        (SELECT count(*)::int FROM campaigns) AS campaigns,
        (SELECT coalesce(sum(amount_minor),0)::bigint FROM payment_events WHERE status='successful') AS payment_volume_minor
      `,
      sql`SELECT pp.id, pp.business_name, pp.verification_status, pp.created_at, p.email, p.display_name FROM publisher_profiles pp JOIN profiles p ON p.id=pp.profile_id WHERE pp.verification_status IN ('unverified','pending') ORDER BY pp.created_at ASC LIMIT 12`,
      sql`SELECT p.id, p.title, p.platform, p.category, p.created_at, pp.business_name FROM placements p JOIN publisher_profiles pp ON pp.id=p.publisher_id WHERE p.status='pending_review' ORDER BY p.created_at ASC LIMIT 12`,
      sql`SELECT action, entity_type, entity_id, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 50`,
      sql`SELECT id, display_name, email, role, status, created_at FROM profiles ORDER BY created_at DESC LIMIT 50`,
      sql`SELECT b.id, b.status, b.amount_minor, b.currency, b.created_at, a.display_name AS advertiser_name, a.email AS advertiser_email, pp.business_name AS publisher_name, pl.title AS placement_title FROM bookings b JOIN profiles a ON a.id=b.advertiser_id JOIN publisher_profiles pp ON pp.id=b.publisher_id JOIN placements pl ON pl.id=b.placement_id ORDER BY b.created_at DESC LIMIT 50`,
      sql`SELECT pe.id, pe.provider, pe.provider_reference, pe.amount_minor, pe.currency, pe.status, pe.verified_at, pe.created_at, b.id AS booking_id, p.email AS advertiser_email FROM payment_events pe JOIN bookings b ON b.id=pe.booking_id JOIN profiles p ON p.id=b.advertiser_id ORDER BY pe.created_at DESC LIMIT 100`,
      sql`SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month_key, to_char(date_trunc('month', created_at), 'Mon YYYY') AS month_label, coalesce(sum(amount_minor),0)::bigint AS amount_minor, count(*)::int AS transactions FROM payment_events WHERE status='successful' AND created_at >= date_trunc('month', now()) - interval '5 months' GROUP BY date_trunc('month', created_at) ORDER BY date_trunc('month', created_at) ASC`,
      sql`SELECT pp.id, pp.business_name, pp.verification_status, pp.payout_provider, CASE WHEN pp.payout_account_reference IS NULL OR pp.payout_account_reference='' THEN false ELSE true END AS payout_details_present, CASE WHEN pp.payout_account_reference IS NULL OR pp.payout_account_reference='' THEN NULL ELSE right(pp.payout_account_reference,4) END AS payout_reference_last4, p.email FROM publisher_profiles pp JOIN profiles p ON p.id=pp.profile_id ORDER BY pp.created_at DESC LIMIT 100`
    ]);
    return json({ profile: auth.profile, stats: stats[0], pendingPublishers, pendingPlacements, recentAudit, users, recentBookings, recentPayments, revenueByMonth, publisherPayoutProfiles });
  } catch (error) {
    console.error('Admin overview query failed', { message: error?.message, code: error?.code });
    return json({ error: 'Could not load owner dashboard data.' }, 500);
  }
}

export default vercelHandler(handler);
