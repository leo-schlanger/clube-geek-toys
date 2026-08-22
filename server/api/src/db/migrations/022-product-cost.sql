-- 022 — Product cost: from revenue to result
--
-- `cost_price` is nullable on purpose: unknown cost is a real catalogue state
-- (old item, giveaway, consignment) and must stay distinguishable from zero
-- cost, which would report 100% margin. Calculations skip costless rows and the
-- report says how many were left out.
--
-- `order_items.unit_cost` is a snapshot, not a reference: a March sale must keep
-- March's cost, or history rewrites itself at every supplier price change.

ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10,2);
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10,2);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(10,2);

DO $$ BEGIN
  ALTER TABLE products ADD CONSTRAINT chk_products_cost_price CHECK (cost_price >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE product_variants ADD CONSTRAINT chk_variants_cost_price CHECK (cost_price >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE order_items ADD CONSTRAINT chk_order_items_unit_cost CHECK (unit_cost >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- For "stock value" and "products without cost", the two catalogue-wide reads.
CREATE INDEX IF NOT EXISTS idx_products_cost_price
  ON products(cost_price)
  WHERE cost_price IS NOT NULL;
