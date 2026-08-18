-- 022 — Custo do produto: de faturamento para resultado
--
-- `products` guardava só o preço de venda. Sem custo não existe margem, lucro
-- por pedido nem CMV — o relatório de fechamento mostrava quanto entrou, nunca
-- quanto sobrou. Duas vendas de R$ 100 podem ser R$ 70 ou R$ 5 de lucro e o
-- painel dizia a mesma coisa das duas.
--
-- `cost_price` é NULL-ável de propósito. Custo desconhecido é um estado real do
-- catálogo (produto antigo, brinde, consignado) e precisa ser distinguível de
-- custo zero — senão o produto entraria no relatório com 100% de margem e
-- inflaria o lucro. Os cálculos ignoram a linha sem custo e o relatório informa
-- quantas ficaram de fora.
--
-- `order_items.unit_cost` é fotografia, não referência. O custo de reposição
-- muda; a margem de uma venda de março tem que continuar usando o custo de
-- março, senão o histórico se reescreve sozinho a cada reajuste de fornecedor.

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

-- Índice para "valor imobilizado em estoque" e "produtos sem custo cadastrado",
-- as duas leituras que varrem o catálogo inteiro atrás desta coluna.
CREATE INDEX IF NOT EXISTS idx_products_cost_price
  ON products(cost_price)
  WHERE cost_price IS NOT NULL;
