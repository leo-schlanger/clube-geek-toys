-- 040 — Club plan bills annually (R$ 159.90)
--
-- New signups and renewals buy a year. Existing `monthly` rows keep the month
-- they paid for; their next charge uses the new price and interval. Runs after
-- step 032, which still sets the old default on every boot.

ALTER TABLE members ALTER COLUMN payment_type SET DEFAULT 'annual';

-- The price was an editable setting that nothing charged from; the plan price
-- is a constant now (CLUB_PLAN_PRICE), so the stale row goes.
DELETE FROM config WHERE key = 'pricing.club_annual';
