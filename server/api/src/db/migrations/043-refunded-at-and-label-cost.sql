-- 043 — When a refund happened, and what the label cost
--
-- Reports dated a refund by the sale: an order paid in September and refunded
-- in October vanished from September's figures and left no trace in October's,
-- so a month already closed changed afterwards. `refunded_at` is the moment the
-- status became 'refunded'. A trigger writes it, so every refund path (panel,
-- Pagar.me webhook, legacy Stripe webhook) records it without remembering to;
-- leaving 'refunded' (a failed refund rolled back) clears it.
--
-- Backfill: `status_changed_at` for orders (migration 025), `updated_at` for
-- payments — the closest record of the change that exists.
--
-- `label_cost` is what Melhor Envio charged for the label, next to the
-- `shipping_cost` the customer paid, so the report can compare the two.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS label_cost NUMERIC(10,2);

UPDATE orders SET refunded_at = COALESCE(status_changed_at, updated_at)
 WHERE status = 'refunded' AND refunded_at IS NULL;
UPDATE payments SET refunded_at = updated_at
 WHERE status = 'refunded' AND refunded_at IS NULL;

CREATE OR REPLACE FUNCTION set_refunded_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'refunded' THEN
    NEW.refunded_at = COALESCE(NEW.refunded_at, NOW());
  ELSE
    NEW.refunded_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_orders_refunded_at ON orders;
CREATE TRIGGER tr_orders_refunded_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION set_refunded_at();

DROP TRIGGER IF EXISTS tr_payments_refunded_at ON payments;
CREATE TRIGGER tr_payments_refunded_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION set_refunded_at();

CREATE INDEX IF NOT EXISTS idx_orders_refunded_at ON orders(refunded_at) WHERE refunded_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_refunded_at ON payments(refunded_at) WHERE refunded_at IS NOT NULL;
