/**
 * Eventos que emitem ingresso.
 *
 * Por que existe uma cópia aqui: o preço e a janela de venda não podem vir do
 * cliente — quem manda o POST da reserva também mandaria o preço. Esta é a
 * fonte de verdade do **servidor**; `src/data/event.ts` (loja) e
 * `geek-toys-home/src/data/event.ts` (site) cuidam da vitrine.
 *
 * Ao trocar de evento, sincronize os três. Ver docs/EVENTS.md.
 */

export type TicketKind = 'full' | 'member' | 'free';

export interface EventDefinition {
  id: string;
  title: string;
  /** Ingresso inteiro, em centavos. */
  priceCents: number;
  startsAt: string;
  endsAt?: string;
  locationName: string;
  locationAddress: string;
  /** Desliga a criação de novas reservas sem esconder os ingressos já emitidos. */
  reservationsOpen: boolean;
}

export const EVENTS: Record<string, EventDefinition> = {
  'kpop-night-2026-09-06': {
    id: 'kpop-night-2026-09-06',
    title: 'GeekPop Night — Encontro K-pop & Collectibles',
    priceCents: 2000,
    startsAt: '2026-09-06T14:00:00-03:00',
    endsAt: '2026-09-06T18:00:00-03:00',
    locationName: 'Copacabana Mar Hotel',
    locationAddress:
      'Rua Ministro Viveiros de Castro, 115 — Copacabana, Rio de Janeiro — RJ',
    reservationsOpen: true,
  },
};

/**
 * Teto por reserva. Não é regra de negócio (a Laura pediu justamente para tirar
 * o limite de 6): é o freio de um endpoint público que cria linha no banco.
 * Uma família cabe folgada; um script não.
 */
export const MAX_TICKETS_PER_RESERVATION = 50;

export function getEvent(eventId: string): EventDefinition | null {
  return EVENTS[eventId] ?? null;
}

/** Preço do ingresso por tipo. Membro paga metade; colo e PCD não pagam. */
export function ticketPriceCents(event: EventDefinition, kind: TicketKind): number {
  if (kind === 'free') return 0;
  if (kind === 'member') return Math.round(event.priceCents / 2);
  return event.priceCents;
}
