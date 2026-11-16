-- Managed campaign ownership and operational progress.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS managed_assigned_to uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS managed_progress_status text NOT NULL DEFAULT 'not_started'
    CHECK (managed_progress_status IN ('not_started','planning','in_progress','awaiting_advertiser','completed')),
  ADD COLUMN IF NOT EXISTS managed_progress_note text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS campaigns_managed_assignee_idx
  ON campaigns(managed_assigned_to, managed_progress_status)
  WHERE campaign_mode='managed';
