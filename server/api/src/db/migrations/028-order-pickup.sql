-- 028 — Counter pickup as an alternative to shipping
--
-- `delivery_method` splits the two flows: pickup has no delivery address, no
-- shipping quote and no tracking code, and the panel's "shipped" means "ready
-- for pickup".
--
-- Default 'shipping' because every existing order was shipped. The CHECK makes
-- a pickup order with a shipping charge a code bug, not a customer choice.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_method VARCHAR(16) NOT NULL DEFAULT 'shipping';

DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT chk_orders_delivery_method
    CHECK (delivery_method IN ('shipping', 'pickup'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT chk_orders_pickup_no_shipping_cost
    CHECK (delivery_method <> 'pickup' OR shipping_cost = 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The panel filters the pickup queue apart from the shipping queue.
CREATE INDEX IF NOT EXISTS idx_orders_delivery_method_status
  ON orders(delivery_method, status);
