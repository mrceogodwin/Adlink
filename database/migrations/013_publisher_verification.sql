-- Publisher verification submissions and review feedback
ALTER TABLE publisher_profiles
  ADD COLUMN IF NOT EXISTS verification_platform text,
  ADD COLUMN IF NOT EXISTS verification_handle text,
  ADD COLUMN IF NOT EXISTS verification_url text,
  ADD COLUMN IF NOT EXISTS verification_note text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS verification_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_review_note text,
  ADD COLUMN IF NOT EXISTS verification_reviewed_at timestamptz;

CREATE INDEX IF NOT EXISTS publisher_verification_queue_idx
  ON publisher_profiles (verification_status, verification_submitted_at);
