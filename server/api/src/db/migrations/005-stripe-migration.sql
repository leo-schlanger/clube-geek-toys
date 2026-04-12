-- Wave: Stripe migration (PagBank → Stripe)
-- Adds stripe_customer_id to members for Stripe Customer association.

ALTER TABLE members ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
CREATE INDEX IF NOT EXISTS idx_members_stripe_customer ON members(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
