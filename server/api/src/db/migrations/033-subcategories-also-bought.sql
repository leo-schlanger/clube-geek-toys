-- 033 — Subcategories, and the index behind "quem comprou também comprou"
--
-- `parent_id` is self-referential and deliberately only one level deep: the
-- storefront nav drills parent → child and nothing renders a third level, so a
-- grandchild would be invisible instead of wrong. The depth rule lives in
-- category.service (a CHECK cannot see the parent's own parent).
--
-- ON DELETE SET NULL, not CASCADE: deleting a parent must not silently delete
-- the children's products along with them. The children become top-level.

ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id) WHERE parent_id IS NOT NULL;

-- A category cannot be its own parent. Deeper cycles are blocked in the service.
DO $$ BEGIN
  ALTER TABLE categories ADD CONSTRAINT chk_categories_parent_not_self CHECK (parent_id IS NULL OR parent_id <> id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- "Os clientes também compram" self-joins order_items on order_id and counts
-- co-occurrences. Without this the join is a sequential scan over every line
-- the store ever sold.
CREATE INDEX IF NOT EXISTS idx_order_items_order_product ON order_items(order_id, product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id) WHERE product_id IS NOT NULL;
