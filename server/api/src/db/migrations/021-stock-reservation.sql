-- 021 — Reserva de estoque entre `create` e `paid`
--
-- Até aqui o estoque só baixava na confirmação do pagamento. Entre criar o
-- pedido e confirmá-lo, a unidade continuava à venda para todo mundo — e o PIX
-- é confirmado à mão, então essa janela dura horas. Dois clientes compravam a
-- mesma última peça e os dois pagavam.
--
-- Pior: a baixa usava `GREATEST(0, stock - qty)`. O segundo pedido confirmava
-- sem erro nenhum, o estoque parava em 0 e a venda a descoberto não aparecia em
-- lugar nenhum — nem no histórico, nem no painel.
--
-- `reserved` é o contrapeso de `stock`: o que já tem dono mas ainda não saiu.
-- A loja passa a vender contra `stock - reserved`. A reserva nasce com o pedido
-- (mesma transação do INSERT), vira baixa de verdade no pagamento, e é devolvida
-- no cancelamento ou quando o TTL vence (varredura diária do cron) — senão um
-- carrinho abandonado seguraria a peça para sempre.
--
-- `stock >= 0` continua valendo. A reserva é que impede o descoberto; o
-- `GREATEST` vira rede de segurança que registra o rombo em vez de escondê-lo.

ALTER TABLE products ADD COLUMN IF NOT EXISTS reserved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS reserved INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE products ADD CONSTRAINT chk_products_reserved CHECK (reserved >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE product_variants ADD CONSTRAINT chk_variants_reserved CHECK (reserved >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Marca no pedido, não só no produto: sem ela não dá para saber se a reserva
-- daquele pedido já foi consumida (pago) ou devolvida (cancelado), e liberar
-- duas vezes tiraria do `reserved` de outro pedido.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_reserved BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMPTZ;

-- A varredura do cron busca exatamente por isto; parcial porque a esmagadora
-- maioria dos pedidos já teve a reserva resolvida.
CREATE INDEX IF NOT EXISTS idx_orders_reservation_expiry
  ON orders(reservation_expires_at)
  WHERE stock_reserved = TRUE;

-- Backfill: os pedidos pendentes que já existem seguram estoque de verdade, e
-- ignorá-los deixaria o `reserved` mentindo desde o primeiro minuto.
--
-- As quatro instruções vão numa chamada só, sem parâmetros: o Postgres envolve
-- um simple query múltiplo numa transação implícita, então ou o `reserved` e a
-- marca no pedido avançam juntos, ou nenhum dos dois avança. O filtro
-- `stock_reserved = FALSE` faz a segunda execução não encontrar nada.
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

-- Produto com variação tem o `reserved` do pai como soma dos filhos, igual ao
-- que já vale para `stock` — é o número que a vitrine mostra.
UPDATE products p
   SET reserved = COALESCE((
         SELECT SUM(v.reserved)::int FROM product_variants v
          WHERE v.product_id = p.id AND v.active = TRUE
       ), 0)
 WHERE COALESCE(p.has_variants, FALSE) = TRUE;
