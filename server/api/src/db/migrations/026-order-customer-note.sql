-- 026 — Recado do cliente para a loja no checkout
--
-- A loja vende photocard e colecionável, onde o pedido quase sempre vem com uma
-- observação: "se tiver do mesmo cantor manda junto", "não precisa embalar para
-- presente", "sou do prédio ao lado". Sem campo para isso o cliente mandava a
-- mensagem por outro canal — Instagram, WhatsApp — e ela chegava desencontrada
-- do pedido, quando chegava.
--
-- Texto livre e curto de propósito: é recado, não endereço nem instrução de
-- entrega, e nada no sistema decide coisa alguma a partir dele. O limite de 500
-- caracteres também está no Zod da rota; a constraint aqui é a rede de baixo,
-- para o caso de alguém escrever no banco por fora da API.
--
-- É dado pessoal como qualquer outro conteúdo escrito pelo cliente: entra no
-- export da LGPD junto com o pedido e é redigido na exclusão.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_note TEXT;

DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT chk_orders_customer_note_len
    CHECK (customer_note IS NULL OR length(customer_note) <= 500);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
