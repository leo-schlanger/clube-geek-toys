-- ============================================
-- Migration 018 — Ícone por categoria
-- ============================================
-- Guarda só o nome do ícone (ex.: 'music', 'gamepad'). O mapeamento
-- nome -> componente vive no front (src/lib/category-icons.ts), então trocar
-- a biblioteca de ícones não exige tocar no banco.
--
-- Idempotente — espelhado em server/api/src/db/ensure-schema.ts.

BEGIN;

ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon VARCHAR(40);

COMMIT;
