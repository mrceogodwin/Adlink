import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { vercelHandler } from '../lib/vercel-handler.js';
import { db, json, requireSession, checkSameOrigin } from '../lib/auth.js';

function validSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'hex');
  let b;
  try { b = Buffer.from(signature, 'hex'); } catch { return false; }
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handler(request) {
  const url = new URL(request.url);
  if (url.searchParams.get('action') === 'webhook') {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'POST' });
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return json({ error: 'Payment webhook is not configured.' }, 503);
    const raw = await request.text();
    if (!validSignature(raw, request.headers.get('x-paystack-signature'), secret)) {
      return json({ error: 'Invalid payment signature.' }, 401);
    }
    try {
      const event = JSON.parse(raw);
      if (event.event !== 'charge.success') return json({ received: true });
      if (event.data?.status !== 'success') return json({ error: 'Payment has not been confirmed successful.' }, 400);
      const reference = String(event.data?.reference || '');
      const amount = Number(event.data?.amount);
      const currency = String(event.data?.currency || '');
      if (!reference || !Number.isSafeInteger(amount) || amount < 100 || currency !== 'NGN') return json({ error: 'Invalid payment event.' }, 400);
      const sql = db();
      const rows = await sql`SELECT id, booking_id, amount_minor, currency, status FROM payment_events WHERE provider='paystack' AND provider_reference=${reference} LIMIT 1`;
      if (!rows.length) return json({ received: true, ignored: true });
      const payment = rows[0];
      if (Number(payment.amount_minor) !== amount || payment.currency !== currency) {
        await sql`UPDATE payment_events SET status='failed', provider_payload=${JSON.stringify(event.data || {})}::jsonb WHERE id=${payment.id} AND status IN ('initialized','pending')`;
        return json({ error: 'Payment amount or currency mismatch.' }, 400);
      }
      const commissionSettings = await sql`SELECT setting_value FROM platform_settings WHERE setting_key='platform_commission_bps' LIMIT 1`;
      const commissionBps = Math.min(10000, Math.max(0, Number(commissionSettings[0]?.setting_value ?? 1500)));
      // Process the successful event, booking transition, and earnings insertion in
      // one database statement. A retried webhook can also repair an earlier partial
      // success because already-successful events are reprocessed idempotently.
      const processed = await sql`
        WITH event_update AS (
          UPDATE payment_events
          SET status='successful', verified_at=coalesce(verified_at,now()), provider_payload=${JSON.stringify(event.data || {})}::jsonb
          WHERE id=${payment.id} AND status IN ('initialized','pending')
          RETURNING id, booking_id
        ), event_existing AS (
          SELECT id, booking_id FROM payment_events
          WHERE id=${payment.id} AND status='successful'
            AND NOT EXISTS (SELECT 1 FROM event_update)
        ), valid_event AS (
          SELECT id, booking_id FROM event_update
          UNION ALL
          SELECT id, booking_id FROM event_existing
        ), booking_paid AS (
          UPDATE bookings b SET status='paid', updated_at=now()
          FROM valid_event e
          WHERE b.id=e.booking_id AND b.status='awaiting_payment'
          RETURNING b.id,b.publisher_id,b.amount_minor,e.id AS payment_event_id
        ), eligible_booking AS (
          SELECT id,publisher_id,amount_minor,payment_event_id FROM booking_paid
          UNION ALL
          SELECT b.id,b.publisher_id,b.amount_minor,e.id AS payment_event_id
          FROM bookings b JOIN valid_event e ON e.booking_id=b.id
          WHERE b.status='paid'
            AND NOT EXISTS (SELECT 1 FROM booking_paid bp WHERE bp.id=b.id)
        ), earnings_insert AS (
          INSERT INTO publisher_earnings
            (payment_event_id,booking_id,publisher_id,gross_amount_minor,commission_bps,commission_amount_minor,net_amount_minor,status)
          SELECT payment_event_id,id,publisher_id,amount_minor,${commissionBps},
            round(amount_minor * ${commissionBps}::numeric / 10000)::bigint,
            amount_minor - round(amount_minor * ${commissionBps}::numeric / 10000)::bigint,
            'pending'
          FROM eligible_booking
          ON CONFLICT (payment_event_id) DO NOTHING
          RETURNING id
        )
        SELECT (SELECT count(*) FROM valid_event)::int AS valid_events,
               (SELECT count(*) FROM eligible_booking)::int AS paid_bookings,
               (SELECT count(*) FROM earnings_insert)::int AS earnings_created
      `;
      if (!processed[0]?.valid_events) return json({ received: true, duplicate: true });
      if (!processed[0]?.paid_bookings) return json({ received: true, review_required: true });
      await sql`INSERT INTO audit_logs (action, entity_type, entity_id, details) VALUES ('paystack_charge_success','payment',${payment.id},${JSON.stringify({ reference, amount, currency })}::jsonb)`;
      return json({ received: true });
    } catch (error) {
      console.error('Paystack webhook processing failed', { message: error?.message, code: error?.code });
      return json({ error: 'Could not process payment event.' }, 500);
    }
  }

  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'POST' });
  if (!checkSameOrigin(request)) return json({ error: 'Cross-origin request rejected.' }, 403);
  const auth = await requireSession(request, ['advertiser']);
  if (auth.error) return auth.error;
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return json({ error: 'Payments are not configured yet. Please contact support.' }, 503);

  try {
    const body = await request.json();
    const bookingId = String(body.booking_id || '');
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuid.test(bookingId)) return json({ error: 'Choose a valid booking.' }, 400);
    const sql = db();
    const rows = await sql`SELECT b.id,b.amount_minor,b.currency,b.status,p.email FROM bookings b JOIN profiles p ON p.id=b.advertiser_id WHERE b.id=${bookingId} AND b.advertiser_id=${auth.profile.id} LIMIT 1`;
    if (!rows.length) return json({ error: 'Booking not found.' }, 404);
    const booking = rows[0];
    if (booking.status !== 'awaiting_payment') return json({ error: 'This booking must be accepted by the publisher before payment.' }, 409);
    const amount = Number(booking.amount_minor);
    if (!Number.isSafeInteger(amount) || amount < 100) return json({ error: 'Booking amount is invalid.' }, 400);
    await sql`UPDATE payment_events SET status='failed' WHERE booking_id=${booking.id} AND provider='paystack' AND status IN ('initialized','pending') AND created_at <= now() - interval '20 minutes'`;
    const inProgress = await sql`SELECT id FROM payment_events WHERE booking_id=${booking.id} AND provider='paystack' AND status IN ('initialized','pending') AND created_at > now() - interval '20 minutes' LIMIT 1`;
    if (inProgress.length) return json({ error: 'A checkout was already started for this booking. Complete it or wait 20 minutes before trying again.' }, 409);

    const reference = 'adlink_' + booking.id.replaceAll('-', '') + '_' + randomUUID().replaceAll('-', '');
    const origin = new URL(request.url).origin;
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + secret, 'content-type': 'application/json' },
      body: JSON.stringify({ email: booking.email, amount, currency: 'NGN', reference, callback_url: origin + '/dashboard?payment=return' })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.status || !result.data?.authorization_url) {
      console.error('Paystack initialization failed', { status: response.status, message: result.message });
      return json({ error: 'Could not start checkout. Please try again.' }, 502);
    }
    await sql`INSERT INTO payment_events (booking_id,provider,provider_reference,amount_minor,currency,status,provider_payload) VALUES (${booking.id},'paystack',${reference},${amount},'NGN','pending',${JSON.stringify({ access_code: result.data.access_code })}::jsonb)`;
    return json({ authorization_url: result.data.authorization_url, reference }, 201);
  } catch (error) {
    console.error('Payment checkout initialization failed', { message: error?.message, code: error?.code });
    return json({ error: 'Could not start checkout. Please try again.' }, 500);
  }
}

export default vercelHandler(handler);
