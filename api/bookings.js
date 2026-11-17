import { vercelHandler } from '../lib/vercel-handler.js';
import { db, json, requireSession, checkSameOrigin } from '../lib/auth.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function handler(request) {
  const auth = await requireSession(request);
  if (auth.error) return auth.error;
  const sql = db();
  if (request.method === 'GET') {
    try {
      const rows = auth.profile.role === 'publisher'
        ? await sql`SELECT b.id,b.deliverable,b.amount_minor,b.currency,b.status,b.requested_publish_at,b.accepted_at,b.completed_at,b.created_at,c.name AS campaign_name,c.objective,p.title AS placement_title,p.platform,advertiser.display_name AS counterparty_name,e.id AS evidence_id,e.evidence_url,e.note AS evidence_note,e.review_status AS evidence_status FROM bookings b JOIN campaigns c ON c.id=b.campaign_id JOIN placements p ON p.id=b.placement_id JOIN profiles advertiser ON advertiser.id=b.advertiser_id LEFT JOIN LATERAL (SELECT id,evidence_url,note,review_status FROM delivery_evidence WHERE booking_id=b.id ORDER BY created_at DESC LIMIT 1) e ON true WHERE b.publisher_id=(SELECT id FROM publisher_profiles WHERE profile_id=${auth.profile.id} LIMIT 1) ORDER BY b.created_at DESC LIMIT 100`
        : auth.profile.role === 'advertiser'
        ? await sql`SELECT b.id,b.deliverable,b.amount_minor,b.currency,b.status,b.requested_publish_at,b.accepted_at,b.completed_at,b.created_at,c.name AS campaign_name,c.objective,p.title AS placement_title,p.platform,pp.business_name AS counterparty_name,e.id AS evidence_id,e.evidence_url,e.note AS evidence_note,e.review_status AS evidence_status FROM bookings b JOIN campaigns c ON c.id=b.campaign_id JOIN placements p ON p.id=b.placement_id JOIN publisher_profiles pp ON pp.id=b.publisher_id LEFT JOIN LATERAL (SELECT id,evidence_url,note,review_status FROM delivery_evidence WHERE booking_id=b.id ORDER BY created_at DESC LIMIT 1) e ON true WHERE b.advertiser_id=${auth.profile.id} ORDER BY b.created_at DESC LIMIT 100`
        : [];
      return json({ data: rows });
    } catch (error) {
      console.error('Booking list failed', { message: error?.message, code: error?.code });
      return json({ error: 'Could not load bookings.' }, 500);
    }
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'GET, POST' });
  if (!checkSameOrigin(request)) return json({ error: 'Cross-origin request rejected.' }, 403);
  if (!['advertiser','publisher'].includes(auth.profile.role)) return json({ error: 'This account cannot manage bookings.' }, 403);
  try {
    const body = await request.json();
    const action = String(body.action || '');
    const bookingId = String(body.booking_id || '');

    if (action === 'cancel' && auth.profile.role === 'advertiser') {
      if (!UUID.test(bookingId)) return json({ error: 'Choose a valid booking.' }, 400);
      const cancelled = await sql`UPDATE bookings
        SET status='cancelled', updated_at=now()
        WHERE id=${bookingId}
          AND advertiser_id=${auth.profile.id}
          AND status='requested'
        RETURNING id,status`;
      if (!cancelled.length) return json({ error: 'Only booking requests that are still awaiting publisher response can be cancelled.' }, 409);
      await sql`INSERT INTO audit_logs(actor_profile_id,action,entity_type,entity_id,details)
        VALUES (${auth.profile.id},'booking_cancelled','booking',${bookingId},'${JSON.stringify({ status: 'cancelled', reason: 'advertiser_cancelled_before_acceptance' })}'::jsonb)`;
      return json({ booking: cancelled[0] });
    }

    if (action === 'submit_evidence' && auth.profile.role === 'publisher') {
      if (!UUID.test(bookingId)) return json({ error: 'Choose a valid booking.' }, 400);
      const evidenceUrl = String(body.evidence_url || '').trim();
      const note = String(body.note || '').trim();
      let parsedUrl;
      try { parsedUrl = new URL(evidenceUrl); } catch { return json({ error: 'Enter a valid public link to your delivery evidence.' }, 400); }
      if (parsedUrl.protocol !== 'https:' || evidenceUrl.length > 2048 || note.length > 2000) return json({ error: 'Evidence must be a valid HTTPS link and the note must be under 2,000 characters.' }, 400);
      const submitted = await sql`WITH eligible AS (
        SELECT b.id FROM bookings b
        WHERE b.id=${bookingId}
          AND b.publisher_id=(SELECT id FROM publisher_profiles WHERE profile_id=${auth.profile.id} LIMIT 1)
          AND b.status IN ('paid','in_progress')
          AND NOT EXISTS (SELECT 1 FROM delivery_evidence de WHERE de.booking_id=b.id AND de.review_status='pending')
        FOR UPDATE
      ), evidence AS (
        INSERT INTO delivery_evidence (booking_id,submitted_by,evidence_url,note,review_status)
        SELECT id,${auth.profile.id},${evidenceUrl},${note},'pending' FROM eligible
        RETURNING id,booking_id,evidence_url,note,review_status
      ), booking_update AS (
        UPDATE bookings SET status='submitted_for_review',updated_at=now()
        WHERE id IN (SELECT booking_id FROM evidence)
        RETURNING id,status
      )
      SELECT evidence.*,booking_update.status AS booking_status
      FROM evidence JOIN booking_update ON booking_update.id=evidence.booking_id`;
      if (!submitted.length) return json({ error: 'This booking is not ready for evidence submission, or it already has evidence awaiting review.' }, 409);
      await sql`INSERT INTO audit_logs(actor_profile_id,action,entity_type,entity_id,details) VALUES (${auth.profile.id},'delivery_evidence_submitted','booking',${bookingId},${JSON.stringify({ evidence_id: submitted[0].id })}::jsonb)`;
      return json({ evidence: submitted[0] }, 201);
    }

    if (action === 'review_evidence' && auth.profile.role === 'advertiser') {
      if (!UUID.test(bookingId)) return json({ error: 'Choose a valid booking.' }, 400);
      const decision = body.decision === 'approve' || body.decision === 'reject' ? body.decision : '';
      const reviewNote = String(body.review_note || '').trim();
      if (!decision || reviewNote.length > 2000) return json({ error: 'Choose approve or reject and keep the note under 2,000 characters.' }, 400);
      const reviewed = await sql`WITH target AS MATERIALIZED (
        SELECT de.id,de.booking_id FROM delivery_evidence de
        JOIN bookings b ON b.id=de.booking_id
        WHERE b.id=${bookingId} AND b.advertiser_id=${auth.profile.id}
          AND b.status='submitted_for_review' AND de.review_status='pending'
        ORDER BY de.created_at DESC LIMIT 1
        FOR UPDATE OF de
      ), evidence_update AS (
        UPDATE delivery_evidence de
        SET review_status=${decision === 'approve' ? 'approved' : 'rejected'},
            reviewed_by=${auth.profile.id},reviewed_at=now(),
            note=CASE WHEN ${reviewNote}='' THEN de.note ELSE left(de.note || E'\\nReview: ' || ${reviewNote},4000) END
        FROM target t WHERE de.id=t.id
        RETURNING de.id,de.booking_id,de.review_status
      ), booking_update AS (
        UPDATE bookings b SET
          status=${decision === 'approve' ? 'completed' : 'in_progress'},
          completed_at=CASE WHEN ${decision}='approve' THEN now() ELSE NULL END,
          updated_at=now()
        FROM evidence_update e WHERE b.id=e.booking_id
        RETURNING b.id,b.status,b.completed_at
      ), earnings_release AS (
        -- Earnings become withdrawable only after the advertiser approves delivery.
        UPDATE publisher_earnings pe
        SET status='available', available_at=now(), updated_at=now()
        FROM booking_update b
        WHERE pe.booking_id=b.id
          AND b.status='completed'
          AND pe.status='pending'
        RETURNING pe.id
      )
      SELECT evidence_update.*,booking_update.status AS booking_status,booking_update.completed_at,
        (SELECT count(*)::int FROM earnings_release) AS earnings_released
      FROM evidence_update JOIN booking_update ON booking_update.id=evidence_update.booking_id`;
      if (!reviewed.length) return json({ error: 'No delivery submission is awaiting your review for this booking.' }, 409);
      await sql`INSERT INTO audit_logs(actor_profile_id,action,entity_type,entity_id,details) VALUES (${auth.profile.id},${decision === 'approve' ? 'delivery_approved' : 'delivery_rejected'},'booking',${bookingId},${JSON.stringify({ evidence_id: reviewed[0].id, review_note: reviewNote, earnings_released: reviewed[0].earnings_released || 0 })}::jsonb)`;
      return json({ review: reviewed[0] });
    }

    if (auth.profile.role === 'publisher') {
      const publisherAction = action === 'accept' || action === 'decline' ? action : '';
      if (!publisherAction || !UUID.test(bookingId)) return json({ error: 'Choose a valid booking action.' }, 400);
      const nextStatus = publisherAction === 'accept' ? 'awaiting_payment' : 'declined';
      const updated = await sql`UPDATE bookings SET status=${nextStatus}, accepted_at=CASE WHEN ${publisherAction}='accept' THEN now() ELSE accepted_at END, updated_at=now() WHERE id=${bookingId} AND publisher_id=(SELECT id FROM publisher_profiles WHERE profile_id=${auth.profile.id} LIMIT 1) AND status='requested' RETURNING id,status`;
      if (!updated.length) return json({ error: 'Booking is no longer awaiting your response.' }, 409);
      await sql`INSERT INTO audit_logs (actor_profile_id,action,entity_type,entity_id,details) VALUES (${auth.profile.id},${publisherAction},'booking',${bookingId},${JSON.stringify({ status: nextStatus })}::jsonb)`;
      return json({ booking: updated[0] });
    }
    const placementId = String(body.placement_id || '');
    const campaignId = String(body.campaign_id || '');
    if (!UUID.test(placementId) || !UUID.test(campaignId)) return json({ error: 'Choose a valid placement and campaign.' }, 400);
    const campaign = await sql`SELECT id FROM campaigns WHERE id=${campaignId} AND advertiser_id=${auth.profile.id} LIMIT 1`;
    if (!campaign.length) return json({ error: 'That campaign does not belong to your account.' }, 404);
    const available = await sql`SELECT p.id,p.publisher_id,p.title,p.deliverable,p.price_minor FROM placements p JOIN publisher_profiles pp ON pp.id=p.publisher_id WHERE p.id=${placementId} AND p.status='published' AND pp.verification_status='verified' LIMIT 1`;
    if (!available.length) return json({ error: 'This placement is no longer available.' }, 404);
    const p = available[0];
    const rows = await sql`WITH booking_lock AS MATERIALIZED (
      -- Serialize concurrent requests for the same advertiser/campaign/placement tuple.
      SELECT pg_advisory_xact_lock(
        hashtextextended(${campaignId} || ':' || ${p.id} || ':' || ${auth.profile.id}, 0)
      ) AS acquired
    )
    INSERT INTO bookings (campaign_id,placement_id,advertiser_id,publisher_id,deliverable,amount_minor,currency,status)
    SELECT ${campaignId},${p.id},${auth.profile.id},${p.publisher_id},${p.deliverable},${p.price_minor},'NGN','requested'
    FROM booking_lock
    WHERE NOT EXISTS (
      SELECT 1 FROM bookings
      WHERE campaign_id=${campaignId} AND placement_id=${p.id}
        AND advertiser_id=${auth.profile.id}
        AND status NOT IN ('cancelled','declined')
    )
    RETURNING id, campaign_id, placement_id, amount_minor, currency, status, created_at`;
    if (!rows.length) return json({ error: 'You already have an active booking request for this placement and campaign.' }, 409);
    return json({ booking: rows[0] }, 201);
  } catch (error) {
    console.error('Booking workflow failed', { message: error?.message, code: error?.code });
    return json({ error: 'Could not complete this booking action.' }, 500);
  }
}

export default vercelHandler(handler);
