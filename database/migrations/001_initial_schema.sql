-- Adlink production schema (PostgreSQL / Neon)
-- Apply with a reviewed migration after configuring DATABASE_URL.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id text UNIQUE,
  email text UNIQUE,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('advertiser','publisher','admin')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','suspended')),
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS publisher_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  business_name text NOT NULL,
  bio text NOT NULL DEFAULT '',
  country_code char(2) NOT NULL DEFAULT 'NG',
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified','pending','verified','rejected')),
  payout_provider text,
  payout_account_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publisher_profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('Instagram','TikTok','WhatsApp','Telegram','Website','Facebook','YouTube','Other')),
  category text NOT NULL,
  handle text NOT NULL,
  description text NOT NULL DEFAULT '',
  audience_size bigint NOT NULL CHECK (audience_size >= 0),
  estimated_reach bigint CHECK (estimated_reach IS NULL OR estimated_reach >= 0),
  engagement_rate numeric(5,2) CHECK (engagement_rate IS NULL OR (engagement_rate >= 0 AND engagement_rate <= 100)),
  price_minor bigint NOT NULL CHECK (price_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'NGN',
  deliverable text NOT NULL DEFAULT 'One sponsored post',
  turnaround_days integer NOT NULL DEFAULT 3 CHECK (turnaround_days BETWEEN 1 AND 90),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','published','paused','rejected')),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS placements_public_search_idx ON placements(status, platform, category, price_minor);
CREATE INDEX IF NOT EXISTS placements_publisher_idx ON placements(publisher_id, status);

CREATE TABLE IF NOT EXISTS saved_placements (
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  placement_id uuid NOT NULL REFERENCES placements(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, placement_id)
);

CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id uuid NOT NULL REFERENCES profiles(id),
  name text NOT NULL,
  objective text NOT NULL CHECK (objective IN ('awareness','traffic','leads','sales','community','other')),
  brief text NOT NULL,
  budget_minor bigint NOT NULL CHECK (budget_minor > 0),
  currency char(3) NOT NULL DEFAULT 'NGN',
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','active','completed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS campaigns_advertiser_idx ON campaigns(advertiser_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  placement_id uuid NOT NULL REFERENCES placements(id),
  advertiser_id uuid NOT NULL REFERENCES profiles(id),
  publisher_id uuid NOT NULL REFERENCES publisher_profiles(id),
  deliverable text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'NGN',
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','accepted','declined','awaiting_payment','paid','in_progress','submitted_for_review','completed','cancelled','disputed')),
  requested_publish_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bookings_advertiser_idx ON bookings(advertiser_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bookings_publisher_idx ON bookings(publisher_id, status);

CREATE TABLE IF NOT EXISTS delivery_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL REFERENCES profiles(id),
  evidence_url text NOT NULL,
  note text NOT NULL DEFAULT '',
  reviewed_by uuid REFERENCES profiles(id),
  reviewed_at timestamptz,
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id),
  provider text NOT NULL,
  provider_reference text NOT NULL UNIQUE,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'NGN',
  status text NOT NULL CHECK (status IN ('initialized','pending','successful','failed','refunded')),
  verified_at timestamptz,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  actor_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  request_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);
