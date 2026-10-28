import { vercelHandler } from '../lib/vercel-handler.js';
import { db, json, requireSession, checkSameOrigin } from '../lib/auth.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function handler(request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'POST' });
  const auth = await requireSession(request, ['super_admin']);
  if (auth.error) return auth.error;
  if (!checkSameOrigin(request)) return json({ error: 'Cross-origin request rejected.' }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'A valid JSON body is required.' }, 400); }
  const entityType = String(body.entityType || '');
  const action = String(body.action || '');
  const id = String(body.id || '');
  if (!['publisher', 'placement'].includes(entityType) || !['approve', 'reject'].includes(action) || !UUID.test(id)) {
    return json({ error: 'Choose a valid moderation action and record ID.' }, 400);
  }

  try {
    const sql = db();
    let changed;
    if (entityType === 'publisher') {
      const status = action === 'approve' ? 'verified' : 'rejected';
      changed = await sql`
        WITH changed AS (
          UPDATE publisher_profiles
          SET verification_status = ${status}, updated_at = now()
          WHERE id = ${id}::uuid AND verification_status IN ('unverified','pending','verified','rejected')
          RETURNING id, verification_status
        ), audited AS (
          INSERT INTO audit_logs (actor_profile_id, action, entity_type, entity_id, details)
          SELECT ${auth.profile.id}::uuid, ${'publisher_' + action}, 'publisher_profile', id::text,
                 jsonb_build_object('verification_status', verification_status)
          FROM changed RETURNING id
        ) SELECT changed.id, changed.verification_status FROM changed
      `;
    } else {
      const status = action === 'approve' ? 'published' : 'rejected';
      changed = await sql`
        WITH changed AS (
          UPDATE placements p
          SET status = ${status}, verified_at = CASE WHEN ${action} = 'approve' THEN now() ELSE p.verified_at END, updated_at = now()
          WHERE p.id = ${id}::uuid
            AND p.status IN ('pending_review','published','paused','rejected')
            AND (${action} <> 'approve' OR EXISTS (
              SELECT 1 FROM publisher_profiles pp WHERE pp.id = p.publisher_id AND pp.verification_status = 'verified'
            ))
          RETURNING p.id, p.status
        ), audited AS (
          INSERT INTO audit_logs (actor_profile_id, action, entity_type, entity_id, details)
          SELECT ${auth.profile.id}::uuid, ${'placement_' + action}, 'placement', id::text,
                 jsonb_build_object('status', status)
          FROM changed RETURNING id
        ) SELECT changed.id, changed.status FROM changed
      `;
    }
    if (!changed.length) return json({ error: entityType === 'placement' && action === 'approve'
      ? 'Record not found or publisher must be verified before publishing.'
      : 'Record not found or no longer eligible for moderation.' }, 409);
    return json({ ok: true, entityType, action, record: changed[0] });
  } catch (error) {
    console.error('Admin moderation action failed', { message: error?.message, code: error?.code });
    return json({ error: 'Moderation action could not be completed.' }, 500);
  }
}

export default vercelHandler(handler);
