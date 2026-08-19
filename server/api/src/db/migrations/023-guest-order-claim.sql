-- 023 — Adoção de pedido de convidado pela conta criada depois
--
-- O checkout aceita compra sem login (`optionalAuth`), e nesse caminho o pedido
-- nasce com `user_id IS NULL`. "Minhas compras" (`listMyOrders`) filtra por
-- `user_id` / `member_id`, então o pedido de convidado ficava órfão para
-- sempre: a pessoa pagava o PIX, recebia a confirmação, criava a conta com o
-- MESMO e-mail depois — e não achava a compra em lugar nenhum. Era o relato
-- "cadastrei com os mesmos dados e não acho a compra dela".
--
-- A adoção acontece no código (auth.service + order.service) e só para conta
-- com e-mail verificado: casar por e-mail sem prova de posse deixaria qualquer
-- um cadastrar com o e-mail alheio e ler endereço e telefone de um pedido que
-- não é seu — vazamento de dado pessoal sob a LGPD.
--
-- O índice existe porque essa varredura passa a rodar em todo login verificado
-- e em toda abertura de "Minhas compras". É parcial (só a fatia órfã, que é
-- pequena e encolhe a cada adoção) e usa `lower(customer_email)` porque a
-- comparação é case-insensitive — `users.email` é normalizado no cadastro, mas
-- `orders.customer_email` guarda o que o cliente digitou no checkout.

CREATE INDEX IF NOT EXISTS idx_orders_guest_email
  ON orders (lower(customer_email))
  WHERE user_id IS NULL;
