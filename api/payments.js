import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { Bachs, webhooks, BachsWebhookError } from '@bachs/sdk';
import { vercelHandler } from '../lib/vercel-handler.js';
import { db, json, requireSession, checkSameOrigin } from '../lib/auth.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseBachsAmountMinor(value) {
  const amount = String(value ?? '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) return null;
  const [whole, fraction = ''] = amount.split('.');
  const minor = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  return minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : null;
}

function safeHexEqual(expected, supplied) {
  if (!supplied || !/^[a-f0-9]+$/i.test(supplied) || expected.length !== supplied.length) return false;
  const left = Buffer.from(expected, 'hex');
  const right = Buffer.from(supplied, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

async function recordSuccessfulBachsPayment(sql, payment, event) {
  const amountMinor = parseBachsAmountMinor(event.data?.amount);
  const currency = String(event.data?.currency || '').toUpperCase();
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 1 || amountMinor !== Number(payment.amount_minor) || amountMinor !== Number(payment.booking_amount_minor) || currency !== String(payment.currency || '').toUpperCase() || currency !== String(payment.booking_currency || '').toUpperCase()) {
    await sql`UPDATE payment_events SET status='failed', provider_payload=provider_payload || ${JSON.stringify({ webhook_error: 'amount_or_currency_mismatch', event_id: event.id })}::jsonb WHERE id=${payment.id} AND status IN ('initialized','pending')`;
    return { mismatch: true };
  }
  const settings = await sql`SELECT setting_value FROM platform_settings WHERE setting_key='platform_commission_bps' LIMIT 1`;
  const rawCommission = settings[0]?.setting_value;
  const configured = rawCommission && typeof rawCommission === 'object'
    ? Number(rawCommission.bps ?? rawCommission.value ?? rawCommission.rate_bps)
    : Number(rawCommission);
  const commissionBps = Number.isFinite(configured) ? Math.min(10000, Math.max(0, Math.round(configured))) : 1500;
  const processed = await sql`
    WITH event_update AS (
      UPDATE payment_events SET status='successful', verified_at=coalesce(verified_at,now()),
        provider_payload=provider_payload || ${JSON.stringify({ webhook_event_id: event.id, charge_id: event.data?.charge_id || null, paid_amount: event.data?.amount, paid_currency: currency })}::jsonb
      WHERE id=${payment.id} AND status IN ('initialized','pending')
      RETURNING id,booking_id
    ), event_existing AS (
      SELECT id,booking_id FROM payment_events WHERE id=${payment.id} AND status='successful'
        AND NOT EXISTS (SELECT 1 FROM event_update)
    ), valid_event AS (
      SELECT id,booking_id FROM event_update UNION ALL SELECT id,booking_id FROM event_existing
    ), booking_paid AS (
      UPDATE bookings b SET status='paid',updated_at=now() FROM valid_event e
      WHERE b.id=e.booking_id AND b.status='awaiting_payment'
      RETURNING b.id,b.publisher_id,b.amount_minor,e.id AS payment_event_id
    ), eligible_booking AS (
      SELECT id,publisher_id,amount_minor,payment_event_id FROM booking_paid
      UNION ALL
      SELECT b.id,b.publisher_id,b.amount_minor,e.id FROM bookings b JOIN valid_event e ON e.booking_id=b.id
      WHERE b.status='paid' AND NOT EXISTS (SELECT 1 FROM booking_paid bp WHERE bp.id=b.id)
    ), earnings_insert AS (
      INSERT INTO publisher_earnings(payment_event_id,booking_id,publisher_id,gross_amount_minor,commission_bps,commission_amount_minor,net_amount_minor,status)
      SELECT payment_event_id,id,publisher_id,amount_minor,${commissionBps},
        round(amount_minor * ${commissionBps}::numeric / 10000)::bigint,
        amount_minor-round(amount_minor * ${commissionBps}::numeric / 10000)::bigint,'pending'
      FROM eligible_booking ON CONFLICT(payment_event_id) DO NOTHING RETURNING id
    )
    SELECT (SELECT count(*) FROM event_update)::int AS newly_processed,
      (SELECT count(*) FROM valid_event)::int AS valid_events,
      (SELECT count(*) FROM eligible_booking)::int AS paid_bookings,
      (SELECT count(*) FROM earnings_insert)::int AS earnings_created
  `;
  return { processed: processed[0] || {} };
}

async function handleBachsWebhook(request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'POST' });
  const secret = process.env.BACHS_WEBHOOK_SECRET;
  if (!secret) return json({ error: 'Bachs webhook is not configured.' }, 503);
  const raw = await request.text();
  let event;
  try {
    event = webhooks.constructEvent(raw, request.headers, secret);
  } catch (error) {
    if (error instanceof BachsWebhookError) return json({ error: 'Invalid Bachs webhook signature.' }, 400);
    console.error('Bachs webhook verification failed', { message: error?.message });
    return json({ error: 'Could not verify Bachs webhook.' }, 400);
  }
  try {
    if (!event?.id || !event?.type) return json({ error: 'Invalid webhook envelope.' }, 400);
    if (event.type !== 'collection.succeeded') return json({ received: true, ignored: true });
    const eventStatus = String(event.data?.status || '').toUpperCase();
    const checkoutId = String(event.data?.checkout_id || '');
    const reference = String(event.data?.reference || '');
    if (!checkoutId && !reference) return json({ received: true, ignored: true });
    const sql = db();
    const rows = await sql`SELECT pe.id,pe.booking_id,pe.amount_minor,pe.currency,pe.status,b.amount_minor AS booking_amount_minor,b.currency AS booking_currency FROM payment_events pe JOIN bookings b ON b.id=pe.booking_id
      WHERE pe.provider='bachs' AND (
        (pe.provider_payload->>'checkout_id'=${checkoutId} AND ${checkoutId} <> '')
        OR (pe.provider_reference=${reference} AND ${reference} <> '')
      ) LIMIT 1`;
    if (eventStatus && !['SUCCEEDED','SUCCESS','PAID','COMPLETED'].includes(eventStatus)) {
      if (rows.length) await sql`UPDATE payment_events SET provider_payload=provider_payload || ${JSON.stringify({ review_required: true, webhook_event_id: event.id, provider_status: eventStatus || 'UNKNOWN' })}::jsonb
        WHERE id=${rows[0].id} AND status IN ('initialized','pending')`;
      return json({ received: true, review_required: true });
    }
    if (!rows.length) return json({ received: true, ignored: true });
    const result = await recordSuccessfulBachsPayment(sql, rows[0], event);
    if (result.mismatch) return json({ error: 'Payment amount or currency mismatch.' }, 400);
    if (!result.processed?.newly_processed) return json({ received: true, duplicate: true });
    if (!result.processed?.paid_bookings) return json({ received: true, review_required: true });
    await sql`INSERT INTO audit_logs(action,entity_type,entity_id,details) VALUES ('bachs_collection_succeeded','payment',${rows[0].id},${JSON.stringify({ event_id: event.id, checkout_id: checkoutId })}::jsonb)`;
    return json({ received: true });
  } catch (error) {
    console.error('Bachs webhook processing failed', { message: error?.message, code: error?.code });
    return json({ error: 'Could not process Bachs event.' }, 500);
  }
}

async function handleBachsCheckout(request, auth) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'POST' });
  const secret = process.env.BACHS_SECRET_KEY;
  if (!secret) return json({ error: 'Bachs sandbox payments are not configured yet.' }, 503);
  if (!secret.startsWith('sk_sandbox_')) return json({ error: 'Bachs sandbox key required. Live keys are blocked in this deployment.' }, 503);
  const body = await request.json();
  const bookingId = String(body.booking_id || '');
  if (!UUID.test(bookingId)) return json({ error: 'Choose a valid booking.' }, 400);
  const sql = db();
  const rows = await sql`SELECT b.id,b.amount_minor,b.currency,b.status,p.email FROM bookings b JOIN profiles p ON p.id=b.advertiser_id WHERE b.id=${bookingId} AND b.advertiser_id=${auth.profile.id} LIMIT 1`;
  if (!rows.length) return json({ error: 'Booking not found.' }, 404);
  const booking = rows[0];
  if (booking.status !== 'awaiting_payment') return json({ error: 'This booking must be accepted by the publisher before payment.' }, 409);
  const amount = Number(booking.amount_minor);
  if (!Number.isSafeInteger(amount) || amount < 100) return json({ error: 'Booking amount is invalid.' }, 400);
  await sql`UPDATE payment_events SET status='failed' WHERE booking_id=${booking.id} AND provider='bachs' AND status IN ('initialized','pending') AND provider_payload ? 'checkout_expires_at' AND (provider_payload->>'checkout_expires_at')::timestamptz <= now()`;
  const inProgress = await sql`SELECT id FROM payment_events WHERE booking_id=${booking.id} AND provider='bachs' AND status IN ('initialized','pending') LIMIT 1`;
  if (inProgress.length) return json({ error: 'A Bachs checkout is already active or its outcome is being reconciled. Please do not start another payment yet.' }, 409);
  const reference = 'adlink_' + booking.id.replaceAll('-', '') + '_' + randomUUID().replaceAll('-', '');
  const origin = new URL(request.url).origin;
  let inserted;
  try {
    inserted = await sql`INSERT INTO payment_events(booking_id,provider,provider_reference,amount_minor,currency,status,provider_payload) VALUES (${booking.id},'bachs',${reference},${amount},${booking.currency || 'NGN'},'initialized','{}'::jsonb) RETURNING id`;
  } catch (error) {
    if (error?.code === '23505') return json({ error: 'A Bachs checkout was started at the same time. Refresh before trying again.' }, 409);
    throw error;
  }
  try {
    const bachs = new Bachs({ apiKey: secret });
    const checkout = await bachs.checkoutSessions.create({
      pricing: { currency: booking.currency || 'NGN', amount: (amount / 100).toFixed(2) },
      reference,
      customer: { email: booking.email },
      success_url: origin + '/dashboard?payment=return',
      cancel_url: origin + '/dashboard?payment=cancelled',
      metadata: { adlink_booking_id: booking.id, adlink_payment_event_id: inserted[0].id }
    }, { idempotencyKey: reference });
    const result = checkout;
    if (!result.checkout_url || !result.checkout_id) {
      await sql`UPDATE payment_events SET status='failed',provider_payload=${JSON.stringify({ initialization_error: 'Bachs returned an incomplete checkout session' })}::jsonb WHERE id=${inserted[0].id} AND status='initialized'`;
      console.error('Bachs checkout initialization returned incomplete session', { has_checkout_url: Boolean(result.checkout_url), has_checkout_id: Boolean(result.checkout_id) });
      return json({ error: 'Could not start Bachs checkout. Please try again.' }, 502);
    }
    await sql`UPDATE payment_events SET status='pending',provider_payload=${JSON.stringify({ checkout_id: result.checkout_id, checkout_status: result.status, checkout_expires_at: result.expires_at || null })}::jsonb WHERE id=${inserted[0].id} AND status='initialized'`;
    return json({ authorization_url: result.checkout_url, checkout_url: result.checkout_url, reference, provider: 'bachs' }, 201);
  } catch (error) {
    console.error('Bachs checkout outcome uncertain', { message: error?.message });
    return json({ error: 'Bachs checkout status is being verified. Refresh before starting another payment.' }, 502);
  }
}

async function handler(request) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  if (action === 'bachs-webhook') return handleBachsWebhook(request);
  if (action === 'webhook') {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'POST' });
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return json({ error: 'Payment webhook is not configured.' }, 503);
    const raw = await request.text();
    const signature = request.headers.get('x-paystack-signature');
    const expected = createHmac('sha512', secret).update(raw).digest('hex');
    if (!safeHexEqual(expected, signature || '')) return json({ error: 'Invalid payment signature.' }, 401);
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
      const rawCommission = commissionSettings[0]?.setting_value;
      const configuredCommission = rawCommission && typeof rawCommission === 'object'
        ? Number(rawCommission.bps ?? rawCommission.value ?? rawCommission.rate_bps)
        : Number(rawCommission);
      const commissionBps = Number.isFinite(configuredCommission) ? Math.min(10000, Math.max(0, Math.round(configuredCommission))) : 1500;
      const processed = await sql`
        WITH event_update AS (
          UPDATE payment_events SET status='successful',verified_at=coalesce(verified_at,now()),provider_payload=${JSON.stringify(event.data || {})}::jsonb
          WHERE id=${payment.id} AND status IN ('initialized','pending') RETURNING id,booking_id
        ), event_existing AS (
          SELECT id,booking_id FROM payment_events WHERE id=${payment.id} AND status='successful' AND NOT EXISTS (SELECT 1 FROM event_update)
        ), valid_event AS (
          SELECT id,booking_id FROM event_update UNION ALL SELECT id,booking_id FROM event_existing
        ), booking_paid AS (
          UPDATE bookings b SET status='paid',updated_at=now() FROM valid_event e WHERE b.id=e.booking_id AND b.status='awaiting_payment'
          RETURNING b.id,b.publisher_id,b.amount_minor,e.id AS payment_event_id
        ), eligible_booking AS (
          SELECT id,publisher_id,amount_minor,payment_event_id FROM booking_paid
          UNION ALL SELECT b.id,b.publisher_id,b.amount_minor,e.id FROM bookings b JOIN valid_event e ON e.booking_id=b.id
          WHERE b.status='paid' AND NOT EXISTS (SELECT 1 FROM booking_paid bp WHERE bp.id=b.id)
        ), earnings_insert AS (
          INSERT INTO publisher_earnings(payment_event_id,booking_id,publisher_id,gross_amount_minor,commission_bps,commission_amount_minor,net_amount_minor,status)
          SELECT payment_event_id,id,publisher_id,amount_minor,${commissionBps},round(amount_minor * ${commissionBps}::numeric / 10000)::bigint,amount_minor-round(amount_minor * ${commissionBps}::numeric / 10000)::bigint,'pending'
          FROM eligible_booking ON CONFLICT(payment_event_id) DO NOTHING RETURNING id
        )
        SELECT (SELECT count(*) FROM valid_event)::int AS valid_events,(SELECT count(*) FROM eligible_booking)::int AS paid_bookings,(SELECT count(*) FROM earnings_insert)::int AS earnings_created
      `;
      if (!processed[0]?.valid_events) return json({ received: true, duplicate: true });
      if (!processed[0]?.paid_bookings) return json({ received: true, review_required: true });
      await sql`INSERT INTO audit_logs(action,entity_type,entity_id,details) VALUES ('paystack_charge_success','payment',${payment.id},${JSON.stringify({ reference, amount, currency })}::jsonb)`;
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
  try {
    if ((process.env.PAYMENT_PROVIDER || 'paystack').toLowerCase() === 'bachs') return await handleBachsCheckout(request, auth);
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return json({ error: 'Payments are not configured yet. Please contact support.' }, 503);
    const body = await request.json();
    const bookingId = String(body.booking_id || '');
    if (!UUID.test(bookingId)) return json({ error: 'Choose a valid booking.' }, 400);
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
    const initialized = await sql`INSERT INTO payment_events(booking_id,provider,provider_reference,amount_minor,currency,status,provider_payload) VALUES (${booking.id},'paystack',${reference},${amount},'NGN','initialized','{}'::jsonb) RETURNING id`;
    try {
      const response = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + secret, 'content-type': 'application/json' },
        body: JSON.stringify({ email: rows[0].email, amount, currency: 'NGN', reference, callback_url: origin + '/dashboard?payment=return' })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.status || !result.data?.authorization_url) {
        await sql`UPDATE payment_events SET status='failed',provider_payload=${JSON.stringify({ initialization_error: result.message || 'Paystack initialization failed' })}::jsonb WHERE id=${initialized[0].id} AND status='initialized'`;
        console.error('Paystack initialization failed', { status: response.status, message: result.message });
        return json({ error: 'Could not start checkout. Please try again.' }, 502);
      }
      await sql`UPDATE payment_events SET status='pending',provider_payload=${JSON.stringify({ access_code: result.data.access_code })}::jsonb WHERE id=${initialized[0].id} AND status='initialized'`;
      return json({ authorization_url: result.data.authorization_url, reference }, 201);
    } catch (providerError) {
      console.error('Paystack initialization outcome uncertain', { message: providerError?.message });
      return json({ error: 'Checkout status is being verified. Please refresh before starting another payment.' }, 502);
    }
  } catch (error) {
    console.error('Payment checkout initialization failed', { message: error?.message, code: error?.code });
    return json({ error: 'Could not start checkout. Please try again.' }, 500);
  }
}

export default vercelHandler(handler);
