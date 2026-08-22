-- 021 — Stock reservation between `create` and `paid`
--
-- Stock only dropped on payment confirmation, and PIX is confirmed by hand, so
-- the unit stayed on sale for hours after being sold. `reserved` counterweights
-- `stock`: the shop sells against `stock - reserved`. The reservation is created
-- with the order, becomes a real decrement on payment, and is returned on cancel
-- or when the TTL expires (daily cron sweep).

ALTER TABLE products ADD COLUMN IF NOT EXISTS reserved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS reserved INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE products ADD CONSTRAINT chk_products_reserved CHECK (reserved >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE product_variants ADD CONSTRAINT chk_variants_reserved CHECK (reserved >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Flag on the order, not just the product: releasing twice would eat another
-- order's `reserved`.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_reserved BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMPTZ;

-- Partial: the cron sweep looks for exactly this, and most orders are settled.
CREATE INDEX IF NOT EXISTS idx_orders_reservation_expiry
  ON orders(reservation_expires_at)
  WHERE stock_reserved = TRUE;

-- Backfill for existing pending orders. All four statements go in a single
-- parameterless call: Postgres wraps a multi-statement simple query in an
-- implicit transaction, so `reserved` and the order flag advance together.
-- `stock_reserved = FALSE` makes a second run a no-op.
UPDATE products p
   SET reserved = p.reserved + x.qty
  FROM (
        SELECT oi.product_id, SUM(oi.quantity)::int AS qty
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
         WHERE o.status = 'pending'
           AND o.stock_reserved = FALSE
           AND oi.variant_id IS NULL
           AND oi.product_id IS NOT NULL
         GROUP BY oi.product_id
       ) x
 WHERE x.product_id = p.id;

UPDATE product_variants v
   SET reserved = v.reserved + x.qty
  FROM (
        SELECT oi.variant_id, SUM(oi.quantity)::int AS qty
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
         WHERE o.status = 'pending'
           AND o.stock_reserved = FALSE
           AND oi.variant_id IS NOT NULL
         GROUP BY oi.variant_id
       ) x
 WHERE x.variant_id = v.id;

UPDATE orders
   SET stock_reserved = TRUE,
       reservation_expires_at = created_at + INTERVAL '24 hours'
 WHERE status = 'pending' AND stock_reserved = FALSE;

-- A variant parent's `reserved` is the sum of its children, same as `stock`.
UPDATE products p
   SET reserved = COALESCE((
         SELECT SUM(v.reserved)::int FROM product_variants v
          WHERE v.product_id = p.id AND v.active = TRUE
       ), 0)
 WHERE COALESCE(p.has_variants, FALSE) = TRUE;
