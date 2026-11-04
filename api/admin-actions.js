import { vercelHandler } from '../lib/vercel-handler.js';
import { db, json, requireSession, checkSameOrigin } from '../lib/auth.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function handler(request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'POST' });
  if (!checkSameOrigin(request)) return json({ error: 'Cross-origin request rejected.' }, 403);
  const auth = await requireSession(request, ['super_admin']);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const entity = ['publisher','placement','user','payment'].includes(body.entity) ? body.entity : '';
    const action = ['approve','reject','suspend','reactivate','refund'].includes(body.action) ? body.action : '';
    const id = String(body.id || '');
    const validAction = entity === 'publisher' || entity === 'placement' ? ['approve','reject'].includes(action) : entity === 'user' ? ['suspend','reactivate'].includes(action) : entity === 'payment' ? action === 'refund' && body.confirm === true : false;
    if (!entity || !validAction || !UUID.test(id)) return json({ error: 'Choose a valid review action and record.' }, 400);
    if (entity === 'user' && id === auth.profile.id) return json({ error: 'You cannot change your own account status from this screen.' }, 400);

    const sql = db();
    let rows;
    if (entity === 'publisher') {
      rows = action === 'approve'
        ? await sql`UPDATE publisher_profiles SET verification_status='verified', updated_at=now() WHERE id=${id} AND verification_status IN ('unverified','pending') RETURNING id, business_name, verification_status`
        : await sql`UPDATE publisher_profiles SET verification_status='rejected', updated_at=now() WHERE id=${id} AND verification_status IN ('unverified','pending') RETURNING id, business_name, verification_status`;
    } else if (entity === 'placement') {
      rows = action === 'approve'
        ? await sql`UPDATE placements SET status='published', verified_at=now(), updated_at=now() WHERE id=${id} AND status='pending_review' RETURNING id, title, status`
        : await sql`UPDATE placements SET status='rejected', updated_at=now() WHERE id=${id} AND status='pending_review' RETURNING id, title, status`;
    } else if (entity === 'user') {
      rows = action === 'suspend'
        ? await sql`UPDATE profiles SET status='suspended', updated_at=now() WHERE id=${id} AND status='active' AND role <> 'super_admin' RETURNING id, email, role, status`
        : await sql`UPDATE profiles SET status='active', updated_at=now() WHERE id=${id} AND status='suspended' AND role <> 'super_admin' RETURNING id, email, role, status`;
    } else {
      const secret = process.env.PAYSTACK_SECRET_KEY;
      if (!secret) return json({ error: 'Paystack refunds are not configured on this deployment.' }, 503);
      const payments = await sql`SELECT id, provider, provider_reference, amount_minor, currency, status FROM payment_events WHERE id=${id} LIMIT 1`;
      if (!payments.length) return json({ error: 'Payment record not found.' }, 404);
      const payment = payments[0];
      if (payment.provider !== 'paystack' || payment.status !== 'successful' || payment.currency !== 'NGN') return json({ error: 'Only successful Paystack NGN payments can be refunded.' }, 409);
      const refundResponse = await fetch('https://api.paystack.co/refund', { method: 'POST', headers: { authorization: 'Bearer ' + secret, 'content-type': 'application/json' }, body: JSON.stringify({ transaction: payment.provider_reference }) });
      const refundResult = await refundResponse.json().catch(() => ({}));
      if (!refundResponse.ok || !refundResult.status) {
        console.error('Paystack refund request failed', { status: refundResponse.status, message: refundResult.message });
        return json({ error: refundResult.message || 'Paystack did not accept the refund request.' }, 502);
      }
      rows = await sql`UPDATE payment_events SET status='refunded', provider_payload=provider_payload || ${JSON.stringify({ refund: refundResult.data || {}, refund_requested_at: new Date().toISOString() })}::jsonb WHERE id=${id} AND status='successful' RETURNING id, provider_reference, amount_minor, currency, status`;
      if (!rows.length) return json({ error: 'Payment state changed during refund. Check Paystack before retrying.' }, 409);
    }
    if (!rows.length) return json({ error: 'Record was not found in the pending review queue. Refresh and try again.' }, 409);

    await sql`INSERT INTO audit_logs (actor_profile_id, action, entity_type, entity_id, details) VALUES (${auth.profile.id}, ${entity === 'payment' ? 'payment_refund_requested' : action}, ${entity}, ${id}, ${JSON.stringify({ result: rows[0] })}::jsonb)`;
    return json({ success: true, record: rows[0] });
  } catch (error) {
    console.error('Admin review action failed', { message: error?.message, code: error?.code });
    return json({ error: 'Could not complete the review action.' }, 500);
  }
}

export default vercelHandler(handler);
