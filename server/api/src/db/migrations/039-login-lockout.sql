-- 039 — Per-account login lockout
--
-- The only brake on password guessing was per IP (20 tries / 5 min). Someone
-- spreading guesses over many addresses could try passwords on an admin
-- account without limit. Five wrong passwords now lock the account for a
-- minute, doubling with each further failure up to an hour, and the owner is
-- e-mailed when it happens. A right password resets the count.

ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_logins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
