-- Migration 010: shipping logistics, tracking, reviews, store credit
-- Shop orders UX (Correios shipping via Melhor Envio, my orders, reviews)

-- ─── Product package dimensions (for shipping quotes) ───────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_g INTEGER CHECK (weight_g IS NULL OR weight_g > 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS height_cm NUMERIC(6,1) CHECK (height_cm IS NULL OR height_cm > 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS width_cm NUMERIC(6,1) CHECK (width_cm IS NULL OR width_cm > 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS length_cm NUMERIC(6,1) CHECK (length_cm IS NULL OR length_cm > 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS rating_avg NUMERIC(3,2) NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0 CHECK (rating_count >= 0);

-- ─── Order shipping + tracking ──────────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_service VARCHAR(40);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_service_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_days INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_code VARCHAR(64);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS store_credit_applied DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (store_credit_applied >= 0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS melhor_envio_cart_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS melhor_envio_order_id TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_tracking ON orders(tracking_code) WHERE tracking_code IS NOT NULL;

-- ─── Product reviews ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title VARCHAR(120),
  body TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'published'
    CHECK (status IN ('pending', 'published', 'hidden')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_product ON product_reviews(product_id, status);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON product_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_order ON product_reviews(order_id);

-- ─── Store credit (review reward / checkout redeem) ─────────────────────────
CREATE TABLE IF NOT EXISTS store_credits (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS store_credit_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  reason VARCHAR(40) NOT NULL
    CHECK (reason IN ('review_reward', 'order_redeem', 'admin_adjust', 'order_refund_credit')),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  review_id UUID REFERENCES product_reviews(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user ON store_credit_ledger(user_id, created_at DESC);

-- Default review reward amount (BRL)
INSERT INTO config (key, value)
VALUES ('review_reward_amount', '1.00'::jsonb)
ON CONFLICT (key) DO NOTHING;

DO $$ BEGIN
  CREATE TRIGGER tr_product_reviews_updated_at
    BEFORE UPDATE ON product_reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
