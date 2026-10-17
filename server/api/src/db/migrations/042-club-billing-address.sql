-- 042 — Billing address for club charges
--
-- Pagar.me verifies the card with the issuer on POST /customers/{id}/cards.
-- A customer with phone and CPF but no address came back 412 before any
-- charge. The shop already sent billing_address; the club had nowhere to
-- keep one. JSON, not columns: the shape is the same object the checkout
-- already collects, and a missing key stays a missing key.

ALTER TABLE members ADD COLUMN IF NOT EXISTS billing_address JSONB;
