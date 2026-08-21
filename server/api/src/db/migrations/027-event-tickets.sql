-- 027 — Ingressos nominais de evento
--
-- Até aqui o "ingresso" era a mensagem de WhatsApp da reserva: qualquer print
-- valia na porta e a reserva só existia na conversa. Duas tabelas resolvem as
-- duas metades do problema — a reserva vira registro, e cada pessoa ganha um
-- código único que a portaria queima na entrada.

CREATE TABLE IF NOT EXISTS event_reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id TEXT NOT NULL,
  code VARCHAR(16) NOT NULL UNIQUE,
  buyer_name TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  buyer_phone TEXT NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  total_cents INT NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  notes TEXT,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_reservations_event ON event_reservations(event_id, status);
CREATE INDEX IF NOT EXISTS idx_event_reservations_created ON event_reservations(created_at DESC);

CREATE TABLE IF NOT EXISTS event_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reservation_id UUID NOT NULL REFERENCES event_reservations(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  -- O código é o ingresso. UNIQUE aqui é o que impede dois "mesmos" ingressos.
  code VARCHAR(24) NOT NULL UNIQUE,
  attendee_name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'full' CHECK (kind IN ('full', 'member', 'free')),
  price_cents INT NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'valid', 'used', 'cancelled')),
  used_at TIMESTAMPTZ,
  used_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_tickets_reservation ON event_tickets(reservation_id);
CREATE INDEX IF NOT EXISTS idx_event_tickets_event_status ON event_tickets(event_id, status);
