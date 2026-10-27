import { vercelHandler } from '../lib/vercel-handler.js';
import { db, json, requireSession } from '../lib/auth.js';

async function handler(request) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, { allow: 'GET' });
  const auth = await requireSession(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const sql = db();
    const [stats, pendingPublishers, pendingPlacements, recentAudit] = await Promise.all([
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
      sql`SELECT action, entity_type, entity_id, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 12`
    ]);
    return json({ profile: auth.profile, stats: stats[0], pendingPublishers, pendingPlacements, recentAudit });
  } catch (error) {
    console.error('Admin overview query failed', { message: error?.message, code: error?.code });
    return json({ error: 'Could not load owner dashboard data.' }, 500);
  }
}

export default vercelHandler(handler);
