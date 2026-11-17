-- Adlink Phase 1: distinguish advertiser self-service campaigns from managed-service requests.
-- Migration 016 follows the separate Bachs sandbox migrations 014 and 015.
-- Safe additive migration: existing campaigns default to self-service.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS campaign_mode text NOT NULL DEFAULT 'self_service'
  CHECK (campaign_mode IN ('self_service','managed'));
CREATE INDEX IF NOT EXISTS campaigns_mode_status_idx
  ON campaigns(campaign_mode, status, created_at DESC);
