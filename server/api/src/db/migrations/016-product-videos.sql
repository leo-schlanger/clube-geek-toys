-- ============================================
-- Migration 016 — Videos on the product form
-- ============================================
-- Each `videos` item is { kind, url, title? }:
--   kind = 'youtube' | 'instagram' | 'file'
--   'file' = MP4 on the /uploads volume (same place as the photos).
--
-- Idempotent — mirrored in server/api/src/db/ensure-schema.ts.

BEGIN;

ALTER TABLE products ADD COLUMN IF NOT EXISTS videos JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
