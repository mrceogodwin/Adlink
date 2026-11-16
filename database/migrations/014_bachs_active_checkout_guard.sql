-- Prevent two simultaneous active Bachs checkouts for the same booking.
-- Expired sessions are marked failed by the application only when the provider
-- supplied an explicit checkout_expires_at timestamp.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM payment_events
    WHERE provider = 'bachs'
      AND status IN ('initialized', 'pending')
    GROUP BY booking_id, provider
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create Bachs active-checkout index: duplicate active payment attempts exist';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS payment_events_one_active_bachs_checkout_per_booking
  ON payment_events (booking_id, provider)
  WHERE provider = 'bachs' AND status IN ('initialized', 'pending');
