-- 034 — Pagar.me (API v5) as the payment provider.
--
-- Additive only. The Stripe columns stay: charges created before this migration
-- are still refundable through Stripe, and their webhooks still have to find
-- their order. `payment_provider` is what tells the two apart from here on.

-- ─── Members: the Pagar.me customer, alongside the Stripe one ────────────────
ALTER TABLE members ADD COLUMN IF NOT EXISTS pagarme_customer_id VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_members_pagarme_customer
  ON members(pagarme_customer_id) WHERE pagarme_customer_id IS NOT NULL;

-- ─── Orders: Pagar.me ids, the real PIX QR, and the card that paid ──────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pagarme_order_id VARCHAR(64);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pagarme_charge_id VARCHAR(64);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(20);
-- The PIX code now comes from Pagar.me instead of being generated locally, so
-- it has to be stored: it cannot be rebuilt from a txid any more.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pix_qr_code TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pix_qr_code_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pix_expires_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS card_brand VARCHAR(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS card_last_four VARCHAR(4);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS installments SMALLINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_document VARCHAR(14);
-- A PSP order charges a `card_id`, which only exists on a customer — and a shop
-- buyer is usually a guest, with no member row to hang it on.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pagarme_customer_id VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_orders_pagarme_order
  ON orders(pagarme_order_id) WHERE pagarme_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_pagarme_charge
  ON orders(pagarme_charge_id) WHERE pagarme_charge_id IS NOT NULL;

-- Everything that exists today was charged through Stripe (or settled by hand).
UPDATE orders SET payment_provider = 'stripe'
 WHERE payment_provider IS NULL AND stripe_payment_intent_id IS NOT NULL;
UPDATE orders SET payment_provider = 'manual'
 WHERE payment_provider IS NULL;

-- ─── Payments: which provider, which charge, and how it was split ───────────
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider VARCHAR(20);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS pagarme_order_id VARCHAR(64);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS pagarme_charge_id VARCHAR(64);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS installments SMALLINT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS card_brand VARCHAR(20);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS card_last_four VARCHAR(4);

CREATE INDEX IF NOT EXISTS idx_payments_pagarme_charge
  ON payments(pagarme_charge_id) WHERE pagarme_charge_id IS NOT NULL;

UPDATE payments SET provider = 'stripe'
 WHERE provider IS NULL AND provider_id LIKE 'pi\_%';
UPDATE payments SET provider = 'manual' WHERE provider IS NULL;

-- Debit joins the allowed methods: Pagar.me settles it on the same order.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS chk_payments_method;
ALTER TABLE payments ADD CONSTRAINT chk_payments_method
  CHECK (method IN ('pix','credit_card','debit_card','boleto','cash'));

-- ─── Subscriptions: same split ──────────────────────────────────────────────
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider VARCHAR(20);
UPDATE subscriptions SET provider = 'stripe' WHERE provider IS NULL;
