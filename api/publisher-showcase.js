import { vercelHandler } from '../lib/vercel-handler.js';
import { neon } from '@neondatabase/serverless';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60, stale-while-revalidate=300' },
  });
}

async function handler(request) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
  if (!process.env.DATABASE_URL) return json({ data: [], count: 0 });
  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`
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
    return json({ data: rows, count: rows.length });
  } catch (error) {
    console.error('Publisher showcase query failed', { message: error?.message });
    return json({ error: 'Could not load publisher showcase.' }, 500);
  }
}

export default vercelHandler(handler);
