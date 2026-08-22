/**
 * Event types and the first-paint fallback.
 *
 * Source of truth is the DB (`GET /events/active`), edited in the admin
 * **Eventos** tab. This used to be hardcoded here, in the API, and on the
 * institutional site — changing an event meant deploying two repos.
 *
 * `FALLBACK_EVENT` covers only the first paint (and API downtime): editing it
 * does **not** change what the site shows. Use `useActiveEvent()` in components.
 *
 * Photos: geek-toys-home/public/eventos/<slug>/ — see docs/EVENTS.md
 */

export type EventStatus = 'draft' | 'published' | 'archived'

export type EventConfig = {
  id: string
  slug: string
  status: EventStatus
  title: string
  shortTitle: string
  bannerText: string
  /** Admin-uploaded flyer. `null` = text-only banner. */
  bannerImageUrl: string | null
  startsAt: string
  endsAt: string | null
  location: {
    name: string
    address: string
    mapsUrl: string | null
  }
  description: string[]
  highlights: string[]
  memberPerk: string | null
  ticketReservation: {
    enabled: boolean
    priceBRL: number | null
    currencyLabel: string
    /** `null` = no cap (the server still rejects absurd quantities). */
    maxPerReservation: number | null
    whatsappNumber: string
    notes: string | null
  }
  /** Cents charged by the server. `priceBRL` is display-only. */
  priceCents: number | null
  createdAt?: string
  updatedAt?: string
}

/**
 * Mirrors the row seeded by migration 029 and the API `FALLBACK_EVENT`.
 * Used only while `/events/active` has not responded.
 */
export const FALLBACK_EVENT: EventConfig = {
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
}

/** Draft and archived stay off the storefront. */
export function isEventVisible(event: EventConfig | null | undefined): boolean {
  return event?.status === 'published'
}

export function formatEventDateRange(
  startsAt: string,
  endsAt?: string | null,
  locale = 'pt-BR'
): string {
  const start = new Date(startsAt)
  const end = endsAt ? new Date(endsAt) : null

  const dateFmt = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
  const timeFmt = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  })

  const datePart = dateFmt.format(start)
  const startTime = timeFmt.format(start)
  if (!end) return `${datePart} · ${startTime}`
  return `${datePart} · ${startTime} – ${timeFmt.format(end)}`
}

/**
 * Public-folder URL for an event photo. Official shots live in the
 * institutional gallery (`geeketoys.com.br#galeria`); this is only the
 * versioned copy under `public/eventos/<slug>/`.
 */
export function photoPublicUrl(event: EventConfig, file: string): string {
  return `/eventos/${event.slug}/${encodeURIComponent(file)}`
}

export type TicketKind = 'full' | 'member' | 'free'

export const TICKET_KIND_LABEL: Record<TicketKind, string> = {
  full: 'Inteira',
  member: 'Membro do Clube (50%)',
  free: 'Isento (colo ou PCD)',
}

/** Price by ticket kind; mirrors `server/api/src/config/events.ts`. */
export function ticketPriceBRL(event: EventConfig, kind: TicketKind): number {
  const price = event.ticketReservation.priceBRL
  if (price == null || kind === 'free') return 0
  if (kind === 'member') return price / 2
  return price
}

export function formatBRL(value: number, currencyLabel = 'R$'): string {
  return `${currencyLabel} ${value.toFixed(2).replace('.', ',')}`
}

/**
 * WhatsApp reservation message.
 *
 * Payment is still arranged there as a fallback. The message now carries the
 * **reservation code** so staff can look it up instead of reconstructing the
 * order from chat.
 */
export function buildReservationWhatsAppUrl(params: {
  event: EventConfig
  name: string
  phone: string
  email: string
  attendees: { name: string; kind: TicketKind }[]
  notes?: string
  reservationCode?: string | null
  ticketsUrl?: string | null
}): string {
  const { event, name, phone, email, attendees, notes, reservationCode, ticketsUrl } = params
  const currency = event.ticketReservation.currencyLabel ?? 'R$'
  const price = event.ticketReservation.priceBRL
  const total = attendees.reduce((sum, a) => sum + ticketPriceBRL(event, a.kind), 0)

  const lines = [
    `Olá! Quero *reservar ingresso(s)* para o evento:`,
    `*${event.title}*`,
    ``,
    `👤 Nome: ${name}`,
    `📱 Telefone: ${phone}`,
    `✉️ E-mail: ${email}`,
    `🎫 Quantidade: ${attendees.length}`,
  ]

  if (attendees.length > 0) {
    lines.push(``, `*Ingressos (um por pessoa):*`)
    attendees.forEach((a, i) => {
      const suffix = a.kind === 'full' ? '' : ` — ${TICKET_KIND_LABEL[a.kind]}`
      lines.push(`${i + 1}. ${a.name}${suffix}`)
    })
  }

  lines.push(
    ``,
    `💵 Valor unitário: ${price == null ? 'a combinar / cortesia' : formatBRL(price, currency)}`,
    `💰 Total estimado: ${price == null ? '—' : formatBRL(total, currency)}`
  )

  if (reservationCode) {
    lines.push(``, `🔖 Código da reserva: *${reservationCode}*`)
  }
  if (ticketsUrl) {
    lines.push(`🔗 Meus ingressos: ${ticketsUrl}`)
  }

  lines.push(``, `_Reserva via loja online (shop.geeketoys.com.br)_`)
  if (notes?.trim()) {
    lines.push(``, `📝 Observações: ${notes.trim()}`)
  }
  lines.push(``, `Aguardo confirmação da reserva. Obrigado(a)!`)

  const text = encodeURIComponent(lines.join('\n'))
  return `https://wa.me/${event.ticketReservation.whatsappNumber}?text=${text}`
}
