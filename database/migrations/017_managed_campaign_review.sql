-- Managed campaign triage. Existing campaigns are not retroactively marked as requests.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS managed_review_status text NOT NULL DEFAULT 'not_applicable'
  CHECK (managed_review_status IN ('not_applicable','pending','accepted','rejected')),
  ADD COLUMN IF NOT EXISTS managed_review_note text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS managed_reviewed_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS managed_reviewed_at timestamptz;
UPDATE campaigns SET managed_review_status='pending'
WHERE campaign_mode='managed' AND managed_review_status='not_applicable';
CREATE INDEX IF NOT EXISTS campaigns_managed_queue_idx
  ON campaigns(managed_review_status, created_at DESC)
  WHERE campaign_mode='managed';
