-- 035 — travas contra cobrança dupla.
--
-- Dois pontos gastavam dinheiro sem exclusão mútua:
--
--  * cobrar o cartão de um pedido: a autorização deixa o pedido `pending` até o
--    webhook liquidar, então um segundo clique nessa janela passava pelo guard
--    de status e cobrava o cliente de novo;
--  * comprar a etiqueta: dois cliques simultâneos criavam dois carrinhos e
--    faziam dois checkouts, cada um debitando o frete da conta da loja.
--
-- A trava é um timestamp reivindicado por UPDATE condicional. Expira sozinha,
-- porque um processo que morre no meio não pode deixar o pedido travado para
-- sempre — o valor é generoso o bastante para cobrir a chamada mais lenta.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS card_payment_started_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS label_purchase_started_at TIMESTAMPTZ;
