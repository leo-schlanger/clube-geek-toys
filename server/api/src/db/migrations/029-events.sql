-- 029 — Events managed by the admin
--
-- The event used to live hardcoded in three files across two repos, so changing
-- a date needed a deploy and there was no path to the next event. This table is
-- the source of truth; the `event.ts` files are first-load fallback only.
--
-- `id` is TEXT (not UUID) on purpose: `event_reservations.event_id` and
-- `event_tickets.event_id` already store the old textual id, and a UUID swap
-- would void tickets already in circulation.

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  title TEXT NOT NULL,
  short_title TEXT NOT NULL DEFAULT '',
  banner_text TEXT NOT NULL DEFAULT '',
  banner_image_url TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  location_name TEXT NOT NULL DEFAULT '',
  location_address TEXT NOT NULL DEFAULT '',
  location_maps_url TEXT,
  description JSONB NOT NULL DEFAULT '[]'::jsonb,
  highlights JSONB NOT NULL DEFAULT '[]'::jsonb,
  member_perk TEXT,
  reservations_open BOOLEAN NOT NULL DEFAULT TRUE,
  price_cents INT CHECK (price_cents IS NULL OR price_cents >= 0),
  currency_label TEXT NOT NULL DEFAULT 'R$',
  max_per_reservation INT CHECK (max_per_reservation IS NULL OR max_per_reservation > 0),
  whatsapp_number TEXT NOT NULL DEFAULT '',
  reservation_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_status_start ON events(status, starts_at DESC);

DO $$ BEGIN
  CREATE TRIGGER tr_events_updated_at BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed the previously hardcoded event with its new date and venue. Keep the old
-- id so issued tickets stay valid. `DO NOTHING` — after this the admin owns the
-- row and a redeploy must not overwrite their edit.
INSERT INTO events (
  id, slug, status, title, short_title, banner_text,
  starts_at, ends_at, location_name, location_address, location_maps_url,
  description, highlights, member_perk,
  reservations_open, price_cents, currency_label, max_per_reservation,
  whatsapp_number, reservation_notes
) VALUES (
  'kpop-night-2026-09-06', 'kpop-night', 'published',
  'Photocard Trading + Dança Livre de K-pop',
  'Photocard Trading',
  '🎉 Photocard Trading + Dança Livre · domingo 20/set, 14h–18h · Entrada R$ 20',
  '2026-09-20T14:00:00-03:00', '2026-09-20T18:00:00-03:00',
  'Mar Palace Copacabana Hotel',
  'Avenida Nossa Senhora de Copacabana, 552 — Copacabana, Rio de Janeiro — RJ',
  'https://maps.google.com/?q=Mar+Palace+Copacabana+Hotel,+Avenida+Nossa+Senhora+de+Copacabana,+552,+Copacabana,+Rio+de+Janeiro',
  '["Um dia inteiro no Mar Palace Copacabana Hotel para trocar photocards, dançar e celebrar o K-pop. Troque, dance e faça amizades — todos os fãs reunidos em um dia incrível.","Entrada: R$ 20 por pessoa, com lanches grátis. Criança de colo e criança com deficiência (PCD) não pagam. Membros do Clube GeekPop & Toys têm 50% de desconto (R$ 10) — apresente a carteirinha digital ou o CPF na porta."]'::jsonb,
  '["Domingo, 20 de setembro · 14h às 18h","Mar Palace Copacabana Hotel — novo local!","Photocard trading + dança livre de K-pop","Lanches grátis","Entrada R$ 20 por pessoa","Criança de colo e criança PCD: entrada gratuita"]'::jsonb,
  'Membros do Clube: 50% de desconto na entrada (R$ 10). Criança de colo e PCD: isentos.',
  TRUE, 2000, 'R$', NULL,
  '5511914662881',
  'Entrada R$ 20/pessoa (membros do Clube: R$ 10). Criança de colo e criança com deficiência não pagam. Cada pessoa recebe um ingresso nominal com QR Code próprio, liberado assim que a equipe confirmar o pagamento.'
)
ON CONFLICT (id) DO NOTHING;
