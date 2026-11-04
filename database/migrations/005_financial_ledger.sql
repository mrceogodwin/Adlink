-- Adlink financial ledger and payout requests
CREATE TABLE IF NOT EXISTS platform_settings (
  setting_key text PRIMARY KEY,
  setting_value jsonb NOT NULL,
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO platform_settings(setting_key,setting_value)
VALUES ('platform_commission_bps','1500'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;
CREATE TABLE IF NOT EXISTS publisher_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_event_id uuid NOT NULL UNIQUE REFERENCES payment_events(id),
  booking_id uuid NOT NULL REFERENCES bookings(id),
  publisher_id uuid NOT NULL REFERENCES publisher_profiles(id),
  gross_amount_minor bigint NOT NULL CHECK(gross_amount_minor >= 0),
  commission_bps integer NOT NULL CHECK(commission_bps BETWEEN 0 AND 10000),
  commission_amount_minor bigint NOT NULL CHECK(commission_amount_minor >= 0),
  net_amount_minor bigint NOT NULL CHECK(net_amount_minor >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','available','paid','reversed')),
  available_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS publisher_earnings_publisher_status_idx ON publisher_earnings(publisher_id,status,created_at DESC);
CREATE TABLE IF NOT EXISTS payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publisher_profiles(id),
  amount_minor bigint NOT NULL CHECK(amount_minor > 0),
  currency char(3) NOT NULL DEFAULT 'NGN',
  status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','processing','paid','rejected','cancelled')),
  payout_reference text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  paid_at timestamptz,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payout_requests_status_idx ON payout_requests(status,requested_at DESC);
