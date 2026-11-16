-- Enforce provider event-id deduplication for Bachs collection webhooks.
-- The payment row stores the event id atomically with the successful transition.
CREATE UNIQUE INDEX IF NOT EXISTS payment_events_one_bachs_webhook_event
  ON public.payment_events (provider, (provider_payload->>'webhook_event_id'))
  WHERE provider = 'bachs' AND provider_payload ? 'webhook_event_id';
