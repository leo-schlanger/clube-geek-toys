-- 031 — Reservation PIX + reservation linked to an account
--
-- `pix_txid` pins the EMV: same code on screen, in the email and on the statement.
-- `user_id` is optional — reserving needs no account; the profile also matches by email.

ALTER TABLE event_reservations ADD COLUMN IF NOT EXISTS pix_txid VARCHAR(25);
ALTER TABLE event_reservations ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_event_reservations_user ON event_reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_event_reservations_email ON event_reservations(LOWER(buyer_email));
