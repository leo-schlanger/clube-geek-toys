-- Migration 007: Add previous refresh token hash for grace period
-- Prevents race condition when multiple tabs refresh simultaneously.
-- Old token remains valid for 30 seconds after rotation.
--
-- Run: ssh $VPS_HOST "docker exec -i clube-geek-postgres psql -U \$POSTGRES_USER \$POSTGRES_DB" < server/api/src/db/migrations/007-refresh-token-grace.sql

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS prev_refresh_token_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_rotated_at TIMESTAMPTZ;

COMMIT;
