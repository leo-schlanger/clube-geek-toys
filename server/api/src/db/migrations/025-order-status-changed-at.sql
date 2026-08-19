-- 025 — A fila do painel envelhece pelo status, não por qualquer escrita
--
-- O dashboard mede "há quantos dias este pedido está parado" com
-- `orders.updated_at` (report.service: filas `to_ship` e `shipped_stale`).
-- `updated_at` é escrito por um trigger em QUALQUER update da linha, então
-- salvar o rastreio, confirmar o PIX ou — a partir da migration 023 — adotar
-- um pedido de convidado zerava o relógio da fila. Um envio parado há 10 dias
-- sumia do alerta porque o cliente entrou na conta.
--
-- `status_changed_at` só se move quando o `status` muda de fato, e isso é
-- garantido por trigger com WHEN: não depende de nenhum call site lembrar de
-- atualizar a coluna, inclusive os que ainda serão escritos.
--
-- Backfill em `updated_at` porque é a melhor aproximação que existe para o
-- histórico — a alternativa seria `created_at`, que faria todo pedido antigo
-- aparecer como parado desde a criação.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;

UPDATE orders SET status_changed_at = updated_at WHERE status_changed_at IS NULL;

CREATE OR REPLACE FUNCTION set_order_status_changed_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.status_changed_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_orders_status_changed_at ON orders;
CREATE TRIGGER tr_orders_status_changed_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION set_order_status_changed_at();

CREATE INDEX IF NOT EXISTS idx_orders_status_changed_at
  ON orders(status, status_changed_at);
