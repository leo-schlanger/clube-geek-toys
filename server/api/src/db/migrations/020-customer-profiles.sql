-- 020 — Customer profile without a subscription + saved products
--
-- Personal data only existed in `members`, which is the subscription record and
-- requires a CPF. `customer_profiles` is 1:1 with `users` and independent of
-- `members`, so a shop-only customer has somewhere to keep phone, birth date,
-- gender and address; becoming a member later keeps the same profile.
--
-- LGPD: every field is optional and the collection is declared in the privacy
-- policy. `marketing_consent` is stored apart from signup — consent cannot be
-- bundled into the service.

CREATE TABLE IF NOT EXISTS customer_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name VARCHAR(200),
  phone VARCHAR(20),
  birth_date DATE,
  -- Closed list with an explicit opt-out: 'prefiro_nao_dizer' must be a real
  -- option, not an empty field.
  gender VARCHAR(20) CHECK (gender IN (
    'feminino', 'masculino', 'nao_binario', 'outro', 'prefiro_nao_dizer'
  )),
  photo_url TEXT,
  -- Same shape as `orders.shipping_address`, so checkout can prefill.
  address JSONB,
  marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Saved for later. Order history lives in `orders` and is not duplicated here.
CREATE TABLE IF NOT EXISTS saved_products (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_products_user
  ON saved_products(user_id, created_at DESC);
