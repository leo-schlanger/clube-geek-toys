-- ============================================
-- Migration 016 — Vídeos no cadastro de produto
-- ============================================
-- Cada item de `videos` é { kind, url, title? }:
--   kind = 'youtube' | 'instagram' | 'file'
--   'file' = MP4 hospedado no próprio volume /uploads (mesmo lugar das fotos).
--
-- Idempotente — espelhado em server/api/src/db/ensure-schema.ts.

BEGIN;

ALTER TABLE products ADD COLUMN IF NOT EXISTS videos JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
