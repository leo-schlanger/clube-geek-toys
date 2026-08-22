-- 025 — Panel queues age by status, not by any write
--
-- The dashboard measured "days stuck" with `orders.updated_at`, which a trigger
-- writes on ANY update: saving a tracking code or claiming a guest order reset
-- the queue clock and a 10-day-old shipment vanished from the alert.
--
-- `status_changed_at` moves only when `status` actually changes, enforced by a
-- trigger WHEN clause so no call site has to remember it.
--
-- Backfilled from `updated_at`: the best approximation available for history.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;

UPDATE orders SET status_changed_at = updated_at WHERE status_changed_at IS NULL;

CREATE OR REPLACE FUNCTION set_order_status_changed_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.status_changed_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_orders_status_changed_at ON orders;
CREATE TRIGGER tr_orders_status_changed_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION set_order_status_changed_at();

CREATE INDEX IF NOT EXISTS idx_orders_status_changed_at
  ON orders(status, status_changed_at);
