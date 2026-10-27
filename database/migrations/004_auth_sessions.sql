-- Revocable, server-side sessions. Only a SHA-256 hash of the random session token is stored.
CREATE TABLE IF NOT EXISTS auth_sessions (
  id bigserial PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_sessions_profile_idx ON auth_sessions(profile_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions(expires_at);
