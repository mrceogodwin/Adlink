import { vercelHandler } from '../lib/vercel-handler.js';
import { db, json, requireSession, checkSameOrigin } from '../lib/auth.js';

const platforms = new Set(['Instagram','TikTok','WhatsApp','Telegram','Website','Facebook','YouTube','Other']);

async function handler(request) {
  const auth = await requireSession(request);
  if (auth.error) return auth.error;
  if (auth.profile.role !== 'publisher') return json({ error: 'Only publisher accounts can manage placements.' }, 403);
  const sql = db();
  if (request.method === 'GET') {
    try {
      let verification;
      try {
        verification = await sql`SELECT business_name, profile_image_url, verification_status, verification_platform, verification_handle, verification_url, verification_note, verification_submitted_at, verification_review_note, verification_reviewed_at FROM publisher_profiles WHERE profile_id=${auth.profile.id} LIMIT 1`;
      } catch (columnError) {
        // Keep publisher workspaces usable if migration 016 has not yet been applied.
        if (!/profile_image_url|column .* does not exist/i.test(String(columnError?.message || ''))) throw columnError;
        verification = await sql`SELECT business_name, verification_status, verification_platform, verification_handle, verification_url, verification_note, verification_submitted_at, verification_review_note, verification_reviewed_at, NULL::text AS profile_image_url FROM publisher_profiles WHERE profile_id=${auth.profile.id} LIMIT 1`;
      }
      const rows = await sql`SELECT id, title, platform, category, handle, description, audience_size, estimated_reach, engagement_rate, price_minor, currency, deliverable, turnaround_days, status, created_at, updated_at FROM placements WHERE publisher_id=(SELECT id FROM publisher_profiles WHERE profile_id=${auth.profile.id} LIMIT 1) ORDER BY created_at DESC LIMIT 100`;
      return json({ data: rows, verification: verification[0] || null });
    } catch (error) {
      console.error('Publisher placement list failed', { message: error?.message });
      return json({ error: 'Could not load your placements.' }, 500);
    }
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'GET, POST' });
  if (!checkSameOrigin(request)) return json({ error: 'Cross-origin request rejected.' }, 403);
  try {
    const body = await request.json();
    if (body.action === 'update_profile_image') {
      const imageUrl = String(body.profile_image_url || '').trim();
      if (imageUrl.length > 2048) return json({ error: 'Image URL is too long.' }, 400);
      if (imageUrl) {
        let parsed;
        try { parsed = new URL(imageUrl); } catch {}
        if (!parsed || parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
          return json({ error: 'Enter a valid public HTTPS image URL.' }, 400);
        }
      }
      const updated = await sql`UPDATE publisher_profiles SET profile_image_url=${imageUrl || null}, updated_at=now() WHERE profile_id=${auth.profile.id} RETURNING profile_image_url`;
      if (!updated.length) return json({ error: 'Publisher profile not found.' }, 404);
      await sql`INSERT INTO audit_logs (actor_profile_id, action, entity_type, entity_id, details) SELECT ${auth.profile.id}, 'update_profile_image', 'publisher', id::text, ${JSON.stringify({ has_image: Boolean(imageUrl) })}::jsonb FROM publisher_profiles WHERE profile_id=${auth.profile.id}`;
      return json({ profile_image_url: updated[0].profile_image_url });
    }
    if (body.action === 'submit_verification') {
      const businessName = String(body.business_name || '').trim();
      const platform = String(body.platform || '').trim();
      const handle = String(body.handle || '').trim();
      const profileUrl = String(body.profile_url || '').trim();
      const note = String(body.note || '').trim();
      const allowedPlatforms = new Set(['X','Instagram','TikTok','Facebook','YouTube','Website','Other']);
      let parsedUrl;
      try { parsedUrl = new URL(profileUrl); } catch {}
      if (businessName.length < 2 || businessName.length > 120 || !allowedPlatforms.has(platform) || handle.length < 2 || handle.length > 180 || !parsedUrl || parsedUrl.protocol !== 'https:' || note.length > 1000) {
        return json({ error: 'Enter a business name, supported platform, handle and valid HTTPS profile or proof link.' }, 400);
      }
      const submitted = await sql`UPDATE publisher_profiles SET business_name=${businessName}, verification_platform=${platform}, verification_handle=${handle}, verification_url=${profileUrl}, verification_note=${note}, verification_status='pending', verification_submitted_at=now(), verification_review_note=NULL, verification_reviewed_at=NULL, updated_at=now() WHERE profile_id=${auth.profile.id} AND verification_status <> 'verified' RETURNING business_name, verification_status, verification_platform, verification_handle, verification_url, verification_submitted_at`;
      if (!submitted.length) return json({ error: 'Your publisher profile is already verified or unavailable. Contact support for changes.' }, 409);
      await sql`INSERT INTO audit_logs (actor_profile_id, action, entity_type, entity_id, details) SELECT ${auth.profile.id}, 'submit_verification', 'publisher', id::text, ${JSON.stringify({ platform, handle })}::jsonb FROM publisher_profiles WHERE profile_id=${auth.profile.id}`;
      return json({ verification: submitted[0] }, 200);
    }
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

export default vercelHandler(handler);
