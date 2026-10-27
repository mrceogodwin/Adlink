import { db, json, requireSession, checkSameOrigin } from '../lib/auth.js';

export default async function handler(request) {
  const auth = await requireSession(request);
  if (auth.error) return auth.error;
  const sql = db();
  if (request.method === 'GET') {
    try {
      const rows = auth.profile.role === 'publisher'
        ? await sql`SELECT b.id,b.deliverable,b.amount_minor,b.currency,b.status,b.requested_publish_at,b.accepted_at,b.completed_at,b.created_at,c.name AS campaign_name,c.objective,p.title AS placement_title,p.platform,advertiser.display_name AS counterparty_name FROM bookings b JOIN campaigns c ON c.id=b.campaign_id JOIN placements p ON p.id=b.placement_id JOIN profiles advertiser ON advertiser.id=b.advertiser_id WHERE b.publisher_id=(SELECT id FROM publisher_profiles WHERE profile_id=${auth.profile.id} LIMIT 1) ORDER BY b.created_at DESC LIMIT 100`
        : auth.profile.role === 'advertiser'
        ? await sql`SELECT b.id,b.deliverable,b.amount_minor,b.currency,b.status,b.requested_publish_at,b.accepted_at,b.completed_at,b.created_at,c.name AS campaign_name,c.objective,p.title AS placement_title,p.platform,pp.business_name AS counterparty_name FROM bookings b JOIN campaigns c ON c.id=b.campaign_id JOIN placements p ON p.id=b.placement_id JOIN publisher_profiles pp ON pp.id=b.publisher_id WHERE b.advertiser_id=${auth.profile.id} ORDER BY b.created_at DESC LIMIT 100`
        : [];
      return json({ data: rows });
    } catch (error) {
      console.error('Booking list failed', { message: error?.message, code: error?.code });
      return json({ error: 'Could not load bookings.' }, 500);
    }
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'GET, POST' });
  if (!checkSameOrigin(request)) return json({ error: 'Cross-origin request rejected.' }, 403);
  if (auth.profile.role !== 'advertiser') return json({ error: 'Only advertisers can request placements.' }, 403);
  try {
    const body = await request.json();
    const placementId = String(body.placement_id || '');
    const campaignId = String(body.campaign_id || '');
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuid.test(placementId) || !uuid.test(campaignId)) return json({ error: 'Choose a valid placement and campaign.' }, 400);
    const campaign = await sql`SELECT id FROM campaigns WHERE id=${campaignId} AND advertiser_id=${auth.profile.id} LIMIT 1`;
    if (!campaign.length) return json({ error: 'That campaign does not belong to your account.' }, 404);
    const available = await sql`SELECT p.id,p.publisher_id,p.title,p.deliverable,p.price_minor FROM placements p JOIN publisher_profiles pp ON pp.id=p.publisher_id WHERE p.id=${placementId} AND p.status='published' AND pp.verification_status='verified' LIMIT 1`;
    if (!available.length) return json({ error: 'This placement is no longer available.' }, 404);
    const p = available[0];
    const rows = await sql`INSERT INTO bookings (campaign_id,placement_id,advertiser_id,publisher_id,deliverable,amount_minor,currency,status) SELECT ${campaignId},${p.id},${auth.profile.id},${p.publisher_id},${p.deliverable},${p.price_minor},'NGN','requested' WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE campaign_id=${campaignId} AND placement_id=${p.id} AND advertiser_id=${auth.profile.id} AND status NOT IN ('cancelled','declined')) RETURNING id, campaign_id, placement_id, amount_minor, currency, status, created_at`;
    if (!rows.length) return json({ error: 'You already have an active booking request for this placement and campaign.' }, 409);
    return json({ booking: rows[0] }, 201);
  } catch (error) {
    console.error('Booking request failed', { message: error?.message, code: error?.code });
    return json({ error: 'Could not request this booking.' }, 500);
  }
}
