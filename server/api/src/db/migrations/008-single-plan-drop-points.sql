-- Migration 008: Collapse plans to a single 'club' plan and drop the points system.
--
-- Business change: the club now has ONE annual plan (R$ 149,99/year) whose benefit is a
-- flat 15% discount on any product. Silver/Gold/Black and the monthly option are gone, and
-- the loyalty points system was removed entirely.
--
-- Safe because there are no real members yet (pre-launch). Idempotent — mirrored in
-- server/api/src/db/ensure-schema.ts which applies the same DDL on API boot.
--
-- Run: ssh $VPS_HOST "docker exec -i clube-geek-postgres psql -U \$POSTGRES_USER \$POSTGRES_DB" < server/api/src/db/migrations/008-single-plan-drop-points.sql

BEGIN;

-- 1. Normalize any existing rows to the new model.
UPDATE members SET plan = 'club' WHERE plan <> 'club';
UPDATE members SET payment_type = 'annual' WHERE payment_type <> 'annual';

-- 2. Drop legacy CHECK constraints (inline names from schema.sql + previously named ones).
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_plan_check;
ALTER TABLE members DROP CONSTRAINT IF EXISTS chk_members_plan;
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_payment_type_check;
ALTER TABLE members DROP CONSTRAINT IF EXISTS chk_points_non_negative;

-- 3. Remove the points system.
DROP TABLE IF EXISTS point_transactions CASCADE;
ALTER TABLE members DROP COLUMN IF EXISTS points;

-- 4. New defaults + CHECK constraints for the single-plan model.
ALTER TABLE members ALTER COLUMN plan SET DEFAULT 'club';
ALTER TABLE members ALTER COLUMN payment_type SET DEFAULT 'annual';
ALTER TABLE members ADD CONSTRAINT chk_members_plan CHECK (plan IN ('club'));
ALTER TABLE members ADD CONSTRAINT chk_members_payment_type CHECK (payment_type IN ('annual'));

COMMIT;
