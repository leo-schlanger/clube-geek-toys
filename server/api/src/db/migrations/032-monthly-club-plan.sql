-- 032 — Club plan bills monthly (R$ 12.50)
--
-- New signups are monthly. Existing `annual` rows keep their paid window;
-- the next charge uses the new price and interval.
--
-- Step 008 used to force `annual` on every boot; that force is removed there
-- so this step owns `payment_type`.

ALTER TABLE members DROP CONSTRAINT IF EXISTS members_payment_type_check;
ALTER TABLE members DROP CONSTRAINT IF EXISTS chk_members_payment_type;

ALTER TABLE members ALTER COLUMN payment_type SET DEFAULT 'monthly';

DO $$ BEGIN
  ALTER TABLE members ADD CONSTRAINT chk_members_payment_type
    CHECK (payment_type IN ('monthly', 'annual'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Catalogue default is 12.50; overwrite a stored copy of the old annual price.
UPDATE config
   SET value = '12.50'::jsonb
 WHERE key = 'pricing.club_annual'
   AND value = '149.99'::jsonb;
