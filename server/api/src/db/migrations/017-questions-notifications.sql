-- ============================================
-- Migration 017 — Perguntas e respostas + notificações
-- ============================================
-- Pedido Laura (14/08/2026): o cliente pergunta o preço/detalhe no produto, a
-- gente responde, e a pessoa recebe um aviso no perfil.
--
-- Modelo Mercado Livre (decidido em 14/08): a pergunta aparece na loja assim
-- que é feita, marcada como "aguardando resposta". Por isso `status` existe —
-- é a alavanca de moderação para esconder spam.
--
-- Idempotente — espelhado em server/api/src/db/ensure-schema.ts.

BEGIN;

CREATE TABLE IF NOT EXISTS product_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'published'
    CHECK (status IN ('published', 'hidden')),
  answer_body TEXT,
  answered_by UUID REFERENCES users(id) ON DELETE SET NULL,
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questions_product
  ON product_questions(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_questions_user ON product_questions(user_id, created_at DESC);
-- Fila do admin: não respondidas primeiro.
CREATE INDEX IF NOT EXISTS idx_questions_pending
  ON product_questions(created_at DESC) WHERE answered_at IS NULL;

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(40) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body TEXT,
  -- Caminho relativo dentro da SPA (ex.: /produto/camiseta-bts).
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications(user_id) WHERE read_at IS NULL;

DO $$ BEGIN
  CREATE TRIGGER tr_product_questions_updated_at
    BEFORE UPDATE ON product_questions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
