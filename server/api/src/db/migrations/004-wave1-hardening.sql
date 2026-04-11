-- Wave 1 hardening migrations
-- (1) consumed verification tokens (one-time email verification tokens)
-- (2) member_id added to processed_webhooks for cleanup convenience (no schema change needed; comment only)

CREATE TABLE IF NOT EXISTS consumed_verification_tokens (
  token_hash VARCHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consumed_tokens_consumed_at
  ON consumed_verification_tokens(consumed_at);

-- TTL cleanup helper: a cron job will delete rows older than 48 hours.
-- Tokens themselves expire in 24h (HMAC payload), so 48h gives a comfortable buffer.

COMMENT ON TABLE consumed_verification_tokens IS
  'Tracks consumed email verification token hashes to enforce one-time use. Cleaned up by cron after 48h.';
