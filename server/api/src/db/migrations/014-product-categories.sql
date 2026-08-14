-- ============================================
-- Migration 014 — Múltiplas categorias por produto
-- ============================================
-- Pedido Laura (14/08/2026): um chaveiro de comidinha asiática pode estar em
-- "Comidas" e em "Acessórios" ao mesmo tempo. Até 5 categorias por produto.
--
-- products.category_id continua existindo como a categoria PRINCIPAL (position 0).
-- Sitemap, "você também pode gostar" e relatórios seguem usando ela sem mudança.
--
-- Idempotente — espelhado em server/api/src/db/ensure-schema.ts.

BEGIN;

CREATE TABLE IF NOT EXISTS product_categories (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  -- 0 = principal (espelha products.category_id)
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_product_categories_category ON product_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_product ON product_categories(product_id, position);

-- Backfill: cada produto já categorizado vira uma linha principal.
INSERT INTO product_categories (product_id, category_id, position)
SELECT id, category_id, 0 FROM products WHERE category_id IS NOT NULL
ON CONFLICT (product_id, category_id) DO NOTHING;

COMMIT;
