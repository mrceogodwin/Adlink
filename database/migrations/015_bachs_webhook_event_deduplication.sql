-- Enforce provider event-id deduplication for Bachs collection webhooks.
-- The payment row stores the event id atomically with the successful transition.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM payment_events
    WHERE provider = 'bachs'
      AND provider_payload ? 'webhook_event_id'
    GROUP BY provider_payload->>'webhook_event_id'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create Bachs webhook event index: duplicate event ids already exist';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS payment_events_one_bachs_webhook_event
  ON public.payment_events (provider, (provider_payload->>'webhook_event_id'))
  WHERE provider = 'bachs' AND provider_payload ? 'webhook_event_id';
