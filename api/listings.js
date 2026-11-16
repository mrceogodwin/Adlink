import { vercelHandler } from '../lib/vercel-handler.js';
import { neon } from '@neondatabase/serverless';

const allowedPlatforms = new Set(['Instagram','TikTok','WhatsApp','Telegram','Website','Facebook','YouTube','Other']);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

async function handler(request) {
  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return json({ error: 'Marketplace database is not configured yet.' }, 503);
  }
  try {
    const url = new URL(request.url);
    if (url.searchParams.get('view') === 'publisher-showcase') {
      const showcase = await neon(databaseUrl)`
        SELECT pp.id, pp.business_name, pp.profile_image_url,
               COALESCE(
                 (SELECT p.platform FROM placements p
                  WHERE p.publisher_id = pp.id AND p.status = 'published'
                  ORDER BY p.created_at DESC LIMIT 1),
                 pp.verification_platform,
                 'Website'
               ) AS platform
        FROM publisher_profiles pp
        WHERE pp.verification_status = 'verified'
          AND EXISTS (SELECT 1 FROM placements p WHERE p.publisher_id = pp.id AND p.status = 'published')
        ORDER BY pp.updated_at DESC
        LIMIT 24
      `;
      return json({ data: showcase, count: showcase.length });
    }
    const view = url.searchParams.get('view');
    const sql = neon(databaseUrl);
    if (view === 'publishers') {
      try {
        const rows = await sql`
          SELECT pp.id, pp.business_name, pp.profile_image_url,
                 COALESCE((SELECT p.platform FROM placements p WHERE p.publisher_id=pp.id AND p.status='published' ORDER BY p.created_at DESC LIMIT 1), pp.verification_platform, 'Website') AS platform
          FROM publisher_profiles pp
          WHERE pp.verification_status='verified'
            AND EXISTS (SELECT 1 FROM placements p WHERE p.publisher_id=pp.id AND p.status='published')
          ORDER BY pp.updated_at DESC
          LIMIT 24
        `;
        return json({ data: rows, count: rows.length, source: 'database' });
      } catch (imageColumnError) {
        if (!/profile_image_url|column .* does not exist/i.test(String(imageColumnError?.message || ''))) throw imageColumnError;
        const rows = await sql`
          SELECT pp.id, pp.business_name, NULL::text AS profile_image_url,
                 COALESCE((SELECT p.platform FROM placements p WHERE p.publisher_id=pp.id AND p.status='published' ORDER BY p.created_at DESC LIMIT 1), pp.verification_platform, 'Website') AS platform
          FROM publisher_profiles pp
          WHERE pp.verification_status='verified'
            AND EXISTS (SELECT 1 FROM placements p WHERE p.publisher_id=pp.id AND p.status='published')
          ORDER BY pp.updated_at DESC
          LIMIT 24
        `;
        return json({ data: rows, count: rows.length, source: 'database', profile_images_pending_migration: true });
      }
    }
    const platform = url.searchParams.get('platform');
    const category = url.searchParams.get('category');
    const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
    const minPrice = Math.max(0, Number(url.searchParams.get('minPrice') || 0));
    const maxPrice = Math.min(100000000000, Number(url.searchParams.get('maxPrice') || 100000000000));
    const limit = Math.min(60, Math.max(1, Number(url.searchParams.get('limit') || 24)));
    if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice) || !Number.isFinite(limit) || minPrice > maxPrice) {
      return json({ error: 'Invalid filter values.' }, 400);
    }
    if (platform && !allowedPlatforms.has(platform)) return json({ error: 'Unsupported platform.' }, 400);
    const rows = await sql`
      SELECT p.id, p.title AS name, p.handle, p.platform AS type, p.category,
             p.description, p.audience_size, p.estimated_reach, p.engagement_rate,
             p.price_minor, p.currency, p.deliverable, p.turnaround_days,
             pp.business_name AS publisher_name, NULL::text AS publisher_image_url, pp.verification_status
      FROM placements p
      JOIN publisher_profiles pp ON pp.id = p.publisher_id
      WHERE p.status = 'published'
        AND pp.verification_status = 'verified'
        AND (${platform || null}::text IS NULL OR p.platform = ${platform || null})
        AND (${category && category !== 'All categories' ? category : null}::text IS NULL OR p.category = ${category && category !== 'All categories' ? category : null})
        AND p.price_minor BETWEEN ${Math.round(minPrice)} AND ${Math.round(maxPrice)}
        AND (${q} = '' OR (p.title || ' ' || p.handle || ' ' || p.category || ' ' || p.description) ILIKE ${'%' + q.replace(/[\\%_]/g, '\\$&') + '%' } ESCAPE '\\')
      ORDER BY p.created_at DESC
      LIMIT ${limit}
    `;
    return json({ data: rows, count: rows.length, source: 'database' });
  } catch (error) {
    console.error('Marketplace listing query failed', { message: error?.message });
    return json({ error: 'Could not load marketplace listings.' }, 500);
  }
}

export default vercelHandler(handler);
