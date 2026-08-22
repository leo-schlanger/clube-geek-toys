-- ============================================
-- Migration 015 — Stock control in the admin panel
-- ============================================
-- Stock existed in products.stock / product_variants.stock with no history, so
-- nobody could tell why a number changed. Adds the ledger (stock_movements) and
-- a per-product low-stock threshold.
--
-- Idempotent — mirrored in server/api/src/db/ensure-schema.ts.

BEGIN;

-- At or below this, the panel flags "acabando".
ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER NOT NULL DEFAULT 3;

CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  -- Null when the product has no variants.
  variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  kind VARCHAR(20) NOT NULL
    CHECK (kind IN ('sale', 'restock', 'adjustment', 'manual_in', 'manual_out')),
  -- Signed: negative = out, positive = in.
  quantity INTEGER NOT NULL,
  stock_after INTEGER,
  note TEXT,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_variant ON stock_movements(variant_id, created_at DESC)
  WHERE variant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_order ON stock_movements(order_id)
  WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at DESC);

COMMIT;
