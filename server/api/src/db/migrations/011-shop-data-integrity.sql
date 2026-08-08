-- Migration 011: shop data integrity + ownership + credit race hardening

-- Link shop orders to authenticated user (even without active membership)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id) WHERE user_id IS NOT NULL;

-- One review-reward credit per order (prevents double-grant race)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_review_reward_once
  ON store_credit_ledger (order_id)
  WHERE reason = 'review_reward' AND order_id IS NOT NULL;

-- One credit restore per order (prevents double-restore)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_order_refund_credit_once
  ON store_credit_ledger (order_id)
  WHERE reason = 'order_refund_credit' AND order_id IS NOT NULL;
