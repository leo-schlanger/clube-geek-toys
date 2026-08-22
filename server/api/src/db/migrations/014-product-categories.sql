-- ============================================
-- Migration 014 — Multiple categories per product
-- ============================================
-- Up to 5 categories per product. products.category_id remains the PRIMARY
-- category (position 0); sitemap, related products and reports keep using it.
--
-- Idempotent — mirrored in server/api/src/db/ensure-schema.ts.

BEGIN;

CREATE TABLE IF NOT EXISTS product_categories (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  -- 0 = primary (mirrors products.category_id)
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_product_categories_category ON product_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_product ON product_categories(product_id, position);

-- Backfill: each already-categorised product becomes a primary row.
INSERT INTO product_categories (product_id, category_id, position)
SELECT id, category_id, 0 FROM products WHERE category_id IS NOT NULL
ON CONFLICT (product_id, category_id) DO NOTHING;

COMMIT;
