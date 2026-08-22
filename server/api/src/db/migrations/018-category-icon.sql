-- ============================================
-- Migration 018 — Icon per category
-- ============================================
-- Stores only the icon key (e.g. 'music', 'gamepad'). The key -> component map
-- lives in the frontend (src/lib/category-icons.ts), so swapping icon libraries
-- never touches the schema.
--
-- Idempotent — mirrored in server/api/src/db/ensure-schema.ts.

BEGIN;

ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon VARCHAR(40);

COMMIT;
