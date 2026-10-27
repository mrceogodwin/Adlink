import { db, json, requireSession, checkSameOrigin } from '../lib/auth.js';

const platforms = new Set(['Instagram','TikTok','WhatsApp','Telegram','Website','Facebook','YouTube','Other']);

export default async function handler(request) {
  const auth = await requireSession(request);
  if (auth.error) return auth.error;
  if (auth.profile.role !== 'publisher') return json({ error: 'Only publisher accounts can manage placements.' }, 403);
  const sql = db();
  if (request.method === 'GET') {
    try {
      const rows = await sql`SELECT id, title, platform, category, handle, description, audience_size, estimated_reach, engagement_rate, price_minor, currency, deliverable, turnaround_days, status, created_at, updated_at FROM placements WHERE publisher_id=(SELECT id FROM publisher_profiles WHERE profile_id=${auth.profile.id} LIMIT 1) ORDER BY created_at DESC LIMIT 100`;
      return json({ data: rows });
    } catch (error) {
      console.error('Publisher placement list failed', { message: error?.message });
      return json({ error: 'Could not load your placements.' }, 500);
    }
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'GET, POST' });
  if (!checkSameOrigin(request)) return json({ error: 'Cross-origin request rejected.' }, 403);
  try {
    const body = await request.json();
    const title = String(body.title || '').trim();
    const platform = String(body.platform || '');
    const category = String(body.category || '').trim();
    const handle = String(body.handle || '').trim();
    const description = String(body.description || '').trim();
    const audience = Number(body.audience_size);
    const reach = body.estimated_reach === '' || body.estimated_reach == null ? null : Number(body.estimated_reach);
    const engagement = body.engagement_rate === '' || body.engagement_rate == null ? null : Number(body.engagement_rate);
    const price = Number(body.price);
    const deliverable = String(body.deliverable || 'One sponsored post').trim().slice(0,250);
    const turnaround = Number(body.turnaround_days || 3);
    if (title.length < 3 || title.length > 120 || !platforms.has(platform) || category.length < 2 || category.length > 80 || handle.length < 2 || handle.length > 180) return json({ error: 'Complete the title, platform, category and audience handle.' }, 400);
    if (!Number.isSafeInteger(audience) || audience < 0 || audience > 1000000000000) return json({ error: 'Enter a valid audience size.' }, 400);
    if (reach !== null && (!Number.isSafeInteger(reach) || reach < 0 || reach > 1000000000000)) return json({ error: 'Enter a valid estimated reach.' }, 400);
    if (engagement !== null && (!Number.isFinite(engagement) || engagement < 0 || engagement > 100)) return json({ error: 'Engagement must be between 0 and 100%.' }, 400);
    if (!Number.isFinite(price) || price < 0 || price > 1000000000 || !Number.isInteger(turnaround) || turnaround < 1 || turnaround > 90) return json({ error: 'Enter a valid price and turnaround.' }, 400);
    const rows = await sql`INSERT INTO placements (publisher_id,title,platform,category,handle,description,audience_size,estimated_reach,engagement_rate,price_minor,currency,deliverable,turnaround_days,status) SELECT pp.id,${title},${platform},${category},${handle},${description.slice(0,3000)},${audience},${reach},${engagement},${Math.round(price*100)},'NGN',${deliverable},${turnaround},'pending_review' FROM publisher_profiles pp WHERE pp.profile_id=${auth.profile.id} AND pp.verification_status IN ('pending','verified') RETURNING id,title,platform,category,handle,audience_size,price_minor,currency,status,created_at`;
    if (!rows.length) return json({ error: 'Publisher profile is not ready. Contact support.' }, 403);
    return json({ placement: rows[0] }, 201);
  } catch (error) {
    console.error('Placement creation failed', { message: error?.message, code: error?.code });
    return json({ error: 'Could not submit placement for review.' }, 500);
  }
}
