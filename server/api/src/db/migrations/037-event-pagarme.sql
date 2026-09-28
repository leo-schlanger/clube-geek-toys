-- 037 — Event tickets paid through Pagar.me
--
-- The reservation PIX was a static BR Code that nobody watched: every purchase
-- waited for someone to read the bank statement and click "Confirmar". The
-- shop moved to Pagar.me on 01/09/2026; this gives the tickets the same PIX,
-- which settles itself through the webhook and the reconciliation sweep.
--
-- `buyer_document` exists because a PSP account refuses an order without the
-- buyer's CPF. `payment_provider` tells the branches apart: 'pagarme' settles
-- itself, 'local' is the legacy static code, NULL is a free reservation.

ALTER TABLE event_reservations ADD COLUMN IF NOT EXISTS buyer_document VARCHAR(14);
ALTER TABLE event_reservations ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(20);
ALTER TABLE event_reservations ADD COLUMN IF NOT EXISTS pagarme_order_id VARCHAR(64);
ALTER TABLE event_reservations ADD COLUMN IF NOT EXISTS pagarme_charge_id VARCHAR(64);
ALTER TABLE event_reservations ADD COLUMN IF NOT EXISTS pix_qr_code TEXT;
ALTER TABLE event_reservations ADD COLUMN IF NOT EXISTS pix_qr_code_url TEXT;
ALTER TABLE event_reservations ADD COLUMN IF NOT EXISTS pix_expires_at TIMESTAMPTZ;
ALTER TABLE event_reservations ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_event_reservations_pagarme_charge
  ON event_reservations(pagarme_charge_id) WHERE pagarme_charge_id IS NOT NULL;

-- Every reservation before this one carried the static code.
UPDATE event_reservations SET payment_provider = 'local'
 WHERE payment_provider IS NULL AND pix_txid IS NOT NULL AND total_cents > 0;
