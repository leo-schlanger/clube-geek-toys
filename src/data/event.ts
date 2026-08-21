/**
 * Active event, for the shop and the club docs.
 *
 * Keep in step with geek-toys-home/src/data/event.ts when the event changes.
 * Fotos: public/eventos/<slug>/
 * Guia: docs/EVENTS.md
 */

export type EventPhoto = {
  file: string
  caption?: string
  alt?: string
}

export type EventConfig = {
  id: string
  slug: string
  enabled: boolean
  title: string
  shortTitle: string
  bannerText: string
  startsAt: string
  endsAt?: string
  location: {
    name: string
    address: string
    mapsUrl?: string
  }
  description: string[]
  highlights: string[]
  memberPerk?: string
  ticketReservation: {
    enabled: boolean
    priceBRL: number | null
    currencyLabel?: string
    /**
     * Teto por reserva. `null` = sem teto (o servidor ainda barra pedidos
     * absurdos). Ficou 6 até 21/08/2026, quando uma família bateu no limite.
     */
    maxPerReservation: number | null
    whatsappNumber: string
    notes?: string
  }
  photos: EventPhoto[]
  ctaPrimary: { label: string; href: string }
  ctaSecondary?: { label: string; href: string }
}

/** Evento ativo — 6 de setembro de 2026 (domingo), 14h–18h. Ingresso R$ 20. */
export const ACTIVE_EVENT: EventConfig = {
  id: 'kpop-night-2026-09-06',
  slug: 'kpop-night',
  enabled: true,
  title: 'GeekPop Night — Encontro K-pop & Collectibles',
  shortTitle: 'GeekPop Night',
  /**
   * Same copy as the institutional site. Two copies of one message: edit here
   * and there together, or the campaign reads differently per domain.
   */
  bannerText: '🎉 GeekPop Night · domingo 6/set, 14h–18h · Ingresso R$ 20',
  startsAt: '2026-09-06T14:00:00-03:00',
  endsAt: '2026-09-06T18:00:00-03:00',
  location: {
    name: 'Copacabana Mar Hotel',
    address:
      'Rua Ministro Viveiros de Castro, 115 — Copacabana, Rio de Janeiro — RJ',
    mapsUrl:
      'https://maps.google.com/?q=Copacabana+Mar+Hotel,+Rua+Ministro+Viveiros+de+Castro,+115+Copacabana+Rio+de+Janeiro',
  },
  description: [
    'Um encontro especial no Copacabana Mar Hotel para fãs de K-pop, colecionáveis e cultura pop. Música ambiente, ambiente temático, lançamentos e muita interação com a equipe GeekPop.',
    'Ingresso: R$ 20 por pessoa. Criança de colo e criança com deficiência (PCD) não pagam. Membros do Clube GeekPop & Toys têm 50% de desconto no ingresso (R$ 10) — apresente a carteirinha digital ou o CPF na porta.',
  ],
  highlights: [
    'Domingo, 6 de setembro · 14h às 18h',
    'Ingresso R$ 20 por pessoa',
    'Criança de colo e criança PCD: entrada gratuita',
    'Ambiente temático, playlist K-pop e espaço para fotos',
    'Fotos na galeria do site (geeketoys.com.br#galeria)',
  ],
  memberPerk:
    'Membros do Clube: 50% de desconto no ingresso (R$ 10). Criança de colo e PCD: isentos.',
  ticketReservation: {
    enabled: true,
    priceBRL: 20,
    currencyLabel: 'R$',
    maxPerReservation: null,
    whatsappNumber: '5511914662881',
    notes:
      'Ingresso R$ 20/pessoa (membros do Clube: R$ 10). Criança de colo e criança com deficiência não pagam. Cada pessoa recebe um ingresso nominal com QR Code próprio, liberado assim que a equipe confirmar o pagamento.',
  },
  photos: [],
  ctaPrimary: { label: 'Reservar ingresso', href: '/evento#ingressos' },
  ctaSecondary: { label: 'Ver evento', href: '/evento' },
}

export function isEventVisible(event: EventConfig = ACTIVE_EVENT): boolean {
  return event.enabled
}

export function formatEventDateRange(
  startsAt: string,
  endsAt?: string,
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

export function photoPublicUrl(event: EventConfig, file: string): string {
  return `/eventos/${event.slug}/${encodeURIComponent(file)}`
}

export type TicketKind = 'full' | 'member' | 'free'

export const TICKET_KIND_LABEL: Record<TicketKind, string> = {
  full: 'Inteira',
  member: 'Membro do Clube (50%)',
  free: 'Isento (colo ou PCD)',
}

/** Preço por tipo, espelhando `server/api/src/config/events.ts`. */
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
 * Mensagem de WhatsApp da reserva.
 *
 * Continua existindo porque o pagamento é combinado por lá. A diferença é que
 * agora ela carrega o **código da reserva**: a equipe procura por ele no painel
 * em vez de reconstruir o pedido a partir da conversa.
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
