-- Migration 006: Add payment_count to members
-- Black plan service discount only applies after 2nd payment
--
-- Run: ssh $VPS_HOST "docker exec -i clube-geek-postgres psql -U \$POSTGRES_USER \$POSTGRES_DB" < server/api/src/db/migrations/006-payment-count.sql

BEGIN;

-- 1. Add column
ALTER TABLE members ADD COLUMN IF NOT EXISTS payment_count INTEGER NOT NULL DEFAULT 0;

-- 2. Backfill from existing payment history
-- Count one-time payments (paid)
UPDATE members m SET payment_count = sub.cnt
FROM (
  SELECT member_id, COUNT(*) AS cnt
  FROM payments
  WHERE status = 'paid'
  GROUP BY member_id
) sub
WHERE m.id = sub.member_id;

-- Add subscription payments (paid) on top
UPDATE members m SET payment_count = m.payment_count + sub.cnt
FROM (
  SELECT member_id, COUNT(*) AS cnt
  FROM subscription_payments
  WHERE status = 'paid'
  GROUP BY member_id
) sub
WHERE m.id = sub.member_id;

COMMIT;
