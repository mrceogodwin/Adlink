import { db, json, requireSession, checkSameOrigin } from '../lib/auth.js';

export default async function handler(request) {
  const auth = await requireSession(request);
  if (auth.error) return auth.error;
  if (auth.profile.role !== 'advertiser') return json({ error: 'Saved placements are available to advertiser accounts.' }, 403);
  const sql = db();
  if (request.method === 'GET') {
    try {
      const rows = await sql`SELECT p.id, p.title, p.platform, p.category, p.handle, p.description, p.audience_size, p.estimated_reach, p.engagement_rate, p.price_minor, p.currency, p.deliverable, p.turnaround_days, pp.business_name AS publisher_name, s.created_at AS saved_at FROM saved_placements s JOIN placements p ON p.id=s.placement_id JOIN publisher_profiles pp ON pp.id=p.publisher_id WHERE s.profile_id=${auth.profile.id} ORDER BY s.created_at DESC LIMIT 200`;
      return json({ data: rows });
    } catch (error) {
      console.error('Saved placement list failed', { message: error?.message });
      return json({ error: 'Could not load saved placements.' }, 500);
    }
  }
  if (!['POST','DELETE'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405, { allow: 'GET, POST, DELETE' });
  if (!checkSameOrigin(request)) return json({ error: 'Cross-origin request rejected.' }, 403);
  try {
    const body = await request.json();
    const placementId = String(body.placement_id || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(placementId)) return json({ error: 'A valid placement ID is required.' }, 400);
    if (request.method === 'POST') {
      const visible = await sql`SELECT p.id FROM placements p JOIN publisher_profiles pp ON pp.id=p.publisher_id WHERE p.id=${placementId} AND p.status='published' AND pp.verification_status='verified' LIMIT 1`;
      if (!visible.length) return json({ error: 'This placement is not currently available.' }, 404);
      await sql`INSERT INTO saved_placements (profile_id, placement_id) VALUES (${auth.profile.id}, ${placementId}) ON CONFLICT (profile_id, placement_id) DO NOTHING`;
      return json({ saved: true }, 201);
    }
    await sql`DELETE FROM saved_placements WHERE profile_id=${auth.profile.id} AND placement_id=${placementId}`;
    return json({ saved: false });
  } catch (error) {
    console.error('Saved placement update failed', { message: error?.message, code: error?.code });
    return json({ error: 'Could not update saved placements.' }, 500);
  }
}
