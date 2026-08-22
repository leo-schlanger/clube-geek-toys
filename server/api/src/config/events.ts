import type { EventRecord } from '../services/event-config.service.js';

/**
 * Eventos: tipos, preço e a semente de primeira carga.
 *
 * A fonte de verdade passou a ser a tabela `events` (migration 029) —
 * `services/event-config.service.ts` a lê e o admin a edita. O que sobrou
 * aqui é o que não pertence ao banco: os tipos, a regra de preço por tipo de
 * ingresso e o teto anti-abuso do endpoint público.
 *
 * `FALLBACK_EVENT` existe só para o intervalo entre subir a API e a migration
 * gravar a linha: sem ele a loja ficaria sem evento nenhum nesse instante.
 * Depois disso ninguém mais lê daqui — editar este arquivo **não** muda o que
 * aparece no site.
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

/**
 * Espelha a linha semeada pela migration 029. Se você mudar uma, mude a outra —
 * mas prefira mudar pelo painel: a migration só grava quando a linha não existe.
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

/** @deprecated Leia o banco via `event-config.service`. Mantido só como fallback. */
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
 * Teto por reserva. Não é regra de negócio (a Laura pediu justamente para tirar
 * o limite de 6): é o freio de um endpoint público que cria linha no banco.
 * Uma família cabe folgada; um script não.
 */
export const MAX_TICKETS_PER_RESERVATION = 50;

/** Preço do ingresso por tipo. Membro paga metade; colo e PCD não pagam. */
export function ticketPriceCents(event: EventDefinition, kind: TicketKind): number {
  if (kind === 'free') return 0;
  if (kind === 'member') return Math.round(event.priceCents / 2);
  return event.priceCents;
}
