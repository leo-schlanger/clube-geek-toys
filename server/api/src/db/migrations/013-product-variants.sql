-- ============================================
-- Migration 013 — Product variants (Shopee model)
-- ============================================
-- A listing (product) may have up to 2 axes (e.g. Cor, Tamanho). Each
-- combination is a SKU in product_variants with its own price/stock/image.
-- One card on the shelf; a variant picker on the detail page.

ALTER TABLE products ADD COLUMN IF NOT EXISTS has_variants BOOLEAN NOT NULL DEFAULT FALSE;
-- Listing axes: [{ "name": "Cor", "options": ["Rosa","Preto"] }, ...] max 2
ALTER TABLE products ADD COLUMN IF NOT EXISTS variant_axes JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS product_variants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  -- Human label: "Rosa / M"
  name VARCHAR(200) NOT NULL,
  -- Axis→option map: {"Cor":"Rosa","Tamanho":"M"}
  options JSONB NOT NULL DEFAULT '{}'::jsonb,
  sku VARCHAR(60),
  price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  compare_at_price DECIMAL(10,2) CHECK (compare_at_price IS NULL OR compare_at_price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_product_active
  ON product_variants(product_id) WHERE active = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_variants_product_name
  ON product_variants(product_id, name);

DO $$ BEGIN
  CREATE TRIGGER tr_product_variants_updated_at
    BEFORE UPDATE ON product_variants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Variant snapshot on the order item (immutable history)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_label VARCHAR(200);
