-- 038 — Why the card was refused, kept on the order
--
-- A declined card leaves the order `pending` so the buyer can retry on the same
-- order number. In the panel that read exactly like an order waiting to be paid:
-- on 01/10/2026 the shop saw eight "Pendente" rows for one buyer and asked
-- whether the payment system was broken, when every attempt had been refused by
-- the issuer or by antifraud. These columns let the panel say so.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_error TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_error_kind VARCHAR(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_failed_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_attempts INTEGER NOT NULL DEFAULT 0;
