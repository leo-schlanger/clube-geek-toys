-- Migration 003: Restructure — constraints and indexes
-- Applied: 2026-04-07

-- Points cannot be negative
ALTER TABLE members ADD CONSTRAINT chk_points_non_negative CHECK (points >= 0);

-- Fast refresh token lookup (auth)
CREATE INDEX IF NOT EXISTS idx_users_refresh_token
  ON users(refresh_token_hash) WHERE refresh_token_hash IS NOT NULL;

-- Subscription payments provider lookup (webhook processing)
CREATE INDEX IF NOT EXISTS idx_subpayments_provider
  ON subscription_payments(provider_payment_id);

-- Compound index for cron job: find active members expiring soon
CREATE INDEX IF NOT EXISTS idx_members_expiry_active
  ON members(expiry_date, status) WHERE status = 'active';
