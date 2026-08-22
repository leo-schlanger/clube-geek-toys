-- 028 — Retirada na loja como alternativa ao envio pelos Correios
--
-- A loja é física (Rua Barata Ribeiro, 181, loja J — Copacabana) e boa parte de
-- quem compra mora perto ou já vai passar lá. Cobrar frete de quem vai buscar o
-- pedido no balcão custava a venda: a pessoa desistia no checkout, mandava
-- mensagem no Instagram e a compra virava um acerto manual fora do sistema.
--
-- `delivery_method` é a coluna que separa os dois fluxos, porque quase tudo em
-- volta do pedido muda com ela: retirada não tem endereço de entrega, não tem
-- cotação de frete, não tem código de rastreio e o "enviado" do painel na
-- verdade quer dizer "pronto para retirar".
--
-- Default 'shipping' de propósito: todo pedido que já existe foi enviado pelos
-- Correios, e ler a coluna como NULL em relatório antigo seria pior do que
-- assumir o que de fato aconteceu.
--
-- O CHECK amarra o convite implícito da coluna: pedido de retirada com frete
-- cobrado é erro de código, não escolha do cliente.

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

-- O painel filtra a fila de retirada ("quem está esperando no balcão") separada
-- da fila de postagem; sem isso vira varredura na tabela inteira de pedidos.
CREATE INDEX IF NOT EXISTS idx_orders_delivery_method_status
  ON orders(delivery_method, status);
