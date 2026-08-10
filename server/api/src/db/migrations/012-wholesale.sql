-- ============================================
-- Migration 012 — Atacado (wholesale B2B)
-- ============================================
-- Aba dedicada na loja, cadastro com CNPJ, aprovação admin,
-- desconto 25% server-side (discount_reason='wholesale_25').
-- Pronto antes da importação: produtos só entram no catálogo
-- atacado quando wholesale_enabled=true.

CREATE TABLE IF NOT EXISTS wholesale_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  cnpj VARCHAR(14) NOT NULL UNIQUE,
  company_name VARCHAR(200) NOT NULL,
  trade_name VARCHAR(200),
  state_registration VARCHAR(40),
  phone VARCHAR(20),
  contact_name VARCHAR(200) NOT NULL,
  -- Atividade / objeto social (admin confere se bate com o que compram)
  business_activity TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'disabled')),
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wholesale_status ON wholesale_accounts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wholesale_cnpj ON wholesale_accounts(cnpj);

DO $$ BEGIN
  CREATE TRIGGER tr_wholesale_accounts_updated_at
    BEFORE UPDATE ON wholesale_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_min_qty INTEGER NOT NULL DEFAULT 1
  CHECK (wholesale_min_qty >= 1);

CREATE INDEX IF NOT EXISTS idx_products_wholesale
  ON products(wholesale_enabled) WHERE wholesale_enabled = TRUE AND active = TRUE;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS channel VARCHAR(20) NOT NULL DEFAULT 'retail';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_cnpj VARCHAR(14);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS wholesale_account_id UUID REFERENCES wholesale_accounts(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT chk_orders_channel CHECK (channel IN ('retail', 'wholesale'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_orders_channel ON orders(channel, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_wholesale ON orders(wholesale_account_id)
  WHERE wholesale_account_id IS NOT NULL;

INSERT INTO config (key, value) VALUES
  ('wholesale.enabled', 'true'::jsonb),
  ('wholesale.discount_percent', '25'::jsonb)
ON CONFLICT (key) DO NOTHING;
