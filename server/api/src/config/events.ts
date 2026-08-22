import type { EventRecord } from '../services/event-config.service.js';

/**
 * Event types, pricing, and the first-load seed.
 *
 * Source of truth is the `events` table (migration 029) —
 * `services/event-config.service.ts` reads it and the admin edits it. What
 * remains here does not belong in the DB: the kinds, the per-kind ticket
 * price rule, and the public-endpoint anti-abuse cap.
 *
 * `FALLBACK_EVENT` covers only the gap between API boot and the migration
 * inserting the row: without it the shop would have no event at that moment.
 * After that, nobody reads this — editing this file does **not** change the
 * site.
 */

export type TicketKind = 'full' | 'member' | 'free';

export interface EventDefinition {
  id: string;
  title: string;
  /** Full-price ticket, in cents. */
  priceCents: number;
  startsAt: string;
  endsAt?: string;
  locationName: string;
  locationAddress: string;
  /** Stops new reservations without hiding tickets already issued. */
  reservationsOpen: boolean;
}

/**
 * Mirrors the row seeded by migration 029. If you change one, change the other —
 * but prefer the panel: the migration writes only when the row is missing.
 */
export const FALLBACK_EVENT: EventRecord = {
  id: 'kpop-night-2026-09-06',
  slug: 'kpop-night',
  status: 'published',
  title: 'Photocard Trading + Dança Livre de K-pop',
  shortTitle: 'Photocard Trading',
  bannerText: '🎉 Photocard Trading + Dança Livre · domingo 20/set, 14h–18h · Entrada R$ 20',
  bannerImageUrl: null,
  startsAt: '2026-09-20T14:00:00-03:00',
  endsAt: '2026-09-20T18:00:00-03:00',
  location: {
    name: 'Mar Palace Copacabana Hotel',
    address: 'Avenida Nossa Senhora de Copacabana, 552 — Copacabana, Rio de Janeiro — RJ',
    mapsUrl:
      'https://maps.google.com/?q=Mar+Palace+Copacabana+Hotel,+Avenida+Nossa+Senhora+de+Copacabana,+552,+Copacabana,+Rio+de+Janeiro',
  },
  description: [
    'Um dia inteiro no Mar Palace Copacabana Hotel para trocar photocards, dançar e celebrar o K-pop. Troque, dance e faça amizades — todos os fãs reunidos em um dia incrível.',
    'Entrada: R$ 20 por pessoa, com lanches grátis. Criança de colo e criança com deficiência (PCD) não pagam. Membros do Clube GeekPop & Toys têm 50% de desconto (R$ 10) — apresente a carteirinha digital ou o CPF na porta.',
  ],
  highlights: [
    'Domingo, 20 de setembro · 14h às 18h',
    'Mar Palace Copacabana Hotel — novo local!',
    'Photocard trading + dança livre de K-pop',
    'Lanches grátis',
    'Entrada R$ 20 por pessoa',
    'Criança de colo e criança PCD: entrada gratuita',
  ],
  memberPerk:
    'Membros do Clube: 50% de desconto na entrada (R$ 10). Criança de colo e PCD: isentos.',
  ticketReservation: {
    enabled: true,
    priceBRL: 20,
    currencyLabel: 'R$',
    maxPerReservation: null,
    whatsappNumber: '5511914662881',
    notes:
      'Entrada R$ 20/pessoa (membros do Clube: R$ 10). Criança de colo e criança com deficiência não pagam. Cada pessoa recebe um ingresso nominal com QR Code próprio, liberado assim que a equipe confirmar o pagamento.',
  },
  priceCents: 2000,
  createdAt: '2026-08-22T00:00:00.000Z',
  updatedAt: '2026-08-22T00:00:00.000Z',
};

/** @deprecated Read the DB via `event-config.service`. Kept only as fallback. */
export const EVENTS: Record<string, EventDefinition> = {
  [FALLBACK_EVENT.id]: {
    id: FALLBACK_EVENT.id,
    title: FALLBACK_EVENT.title,
    priceCents: FALLBACK_EVENT.priceCents ?? 0,
    startsAt: FALLBACK_EVENT.startsAt,
    endsAt: FALLBACK_EVENT.endsAt ?? undefined,
    locationName: FALLBACK_EVENT.location.name,
    locationAddress: FALLBACK_EVENT.location.address,
    reservationsOpen: FALLBACK_EVENT.ticketReservation.enabled,
  },
};

/**
 * Cap per reservation. Not a business rule (the limit of 6 was removed on
 * purpose): it is a brake on a public endpoint that inserts a row. A family
 * fits; a script does not.
 */
export const MAX_TICKETS_PER_RESERVATION = 50;

/** Ticket price by kind. Members pay half; infants and PCD pay nothing. */
export function ticketPriceCents(event: EventDefinition, kind: TicketKind): number {
  if (kind === 'free') return 0;
  if (kind === 'member') return Math.round(event.priceCents / 2);
  return event.priceCents;
}
