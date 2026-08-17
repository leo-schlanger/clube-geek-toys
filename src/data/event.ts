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
    maxPerReservation: number
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
    maxPerReservation: 6,
    whatsappNumber: '5511914662881',
    notes:
      'Ingresso R$ 20/pessoa (membros do Clube: R$ 10). Criança de colo e criança com deficiência não pagam — informe na observação. A reserva é enviada pelo WhatsApp da loja para confirmação. Pagamento e retirada conforme orientação da equipe.',
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

export function buildReservationWhatsAppUrl(params: {
  event: EventConfig
  name: string
  phone: string
  email: string
  quantity: number
  notes?: string
}): string {
  const { event, name, phone, email, quantity, notes } = params
  const price =
    event.ticketReservation.priceBRL == null
      ? 'a combinar / cortesia'
      : `${event.ticketReservation.currencyLabel ?? 'R$'} ${event.ticketReservation.priceBRL
          .toFixed(2)
          .replace('.', ',')}`

  const total =
    event.ticketReservation.priceBRL == null
      ? '—'
      : `${event.ticketReservation.currencyLabel ?? 'R$'} ${(
          event.ticketReservation.priceBRL * quantity
        )
          .toFixed(2)
          .replace('.', ',')}`

  const lines = [
    `Olá! Quero *reservar ingresso(s)* para o evento:`,
    `*${event.title}*`,
    ``,
    `👤 Nome: ${name}`,
    `📱 Telefone: ${phone}`,
    `✉️ E-mail: ${email}`,
    `🎫 Quantidade: ${quantity}`,
    `💵 Valor unitário: ${price}`,
    `💰 Total estimado: ${total}`,
    ``,
    `_Reserva via loja online (shop.geeketoys.com.br)_`,
  ]
  if (notes?.trim()) {
    lines.push(``, `📝 Observações: ${notes.trim()}`)
  }
  lines.push(``, `Aguardo confirmação da reserva. Obrigado(a)!`)

  const text = encodeURIComponent(lines.join('\n'))
  return `https://wa.me/${event.ticketReservation.whatsappNumber}?text=${text}`
}
