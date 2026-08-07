/**
 * Evento ativo — loja (shop.geeketoys.com.br) e documentação do clube.
 *
 * Manter alinhado com geek-toys-home/src/data/event.ts quando o evento mudar.
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
  bannerText:
    '🎉 GeekPop Night no dia 6 de setembro (domingo), 14h–18h! Ingresso R$ 20 — reserve já.',
  startsAt: '2026-09-06T14:00:00-03:00',
  endsAt: '2026-09-06T18:00:00-03:00',
  location: {
    name: 'GeekPop & Toys — Copacabana',
    address: 'R. Barata Ribeiro, 181 — loja J, Copacabana, Rio de Janeiro — RJ',
    mapsUrl:
      'https://maps.google.com/?q=R.+Barata+Ribeiro,+181+Copacabana+Rio+de+Janeiro',
  },
  description: [
    'Um encontro especial na loja para fãs de K-pop, colecionáveis e cultura pop. Música ambiente, ambiente temático, lançamentos e muita interação com a equipe GeekPop.',
    'Ingresso: R$ 20 por pessoa. Criança de colo e criança com deficiência (PCD) não pagam. Membros do Clube GeekPop & Toys têm entrada gratuita nos eventos participantes — apresente a carteirinha digital ou o CPF na porta.',
  ],
  highlights: [
    'Domingo, 6 de setembro · 14h às 18h',
    'Ingresso R$ 20 por pessoa',
    'Criança de colo e criança PCD: entrada gratuita',
    'Ambiente temático, playlist K-pop e espaço para fotos',
    'Fotos oficiais disponíveis para download no site após o evento',
  ],
  memberPerk:
    'Membros do Clube: entrada gratuita (eventos participantes). Criança de colo e PCD: isentos.',
  ticketReservation: {
    enabled: true,
    priceBRL: 20,
    currencyLabel: 'R$',
    maxPerReservation: 6,
    whatsappNumber: '5511914662881',
    notes:
      'Ingresso R$ 20/pessoa. Criança de colo e criança com deficiência não pagam — informe na observação. A reserva é enviada pelo WhatsApp da loja para confirmação. Pagamento e retirada conforme orientação da equipe.',
  },
  photos: [
    { file: "evento-01.jpg", alt: "GeekPop Night — foto 1", caption: "Foto 1" },
    { file: "evento-02.jpg", alt: "GeekPop Night — foto 2", caption: "Foto 2" },
    { file: "evento-03.jpg", alt: "GeekPop Night — foto 3", caption: "Foto 3" },
    { file: "evento-04.jpg", alt: "GeekPop Night — foto 4", caption: "Foto 4" },
    { file: "evento-05.jpg", alt: "GeekPop Night — foto 5", caption: "Foto 5" },
    { file: "evento-06.jpg", alt: "GeekPop Night — foto 6", caption: "Foto 6" },
    { file: "evento-07.jpg", alt: "GeekPop Night — foto 7", caption: "Foto 7" },
    { file: "evento-08.jpg", alt: "GeekPop Night — foto 8", caption: "Foto 8" },
    { file: "evento-09.jpg", alt: "GeekPop Night — foto 9", caption: "Foto 9" },
    { file: "evento-10.jpg", alt: "GeekPop Night — foto 10", caption: "Foto 10" },
    { file: "evento-11.jpg", alt: "GeekPop Night — foto 11", caption: "Foto 11" },
    { file: "evento-12.jpg", alt: "GeekPop Night — foto 12", caption: "Foto 12" },
    { file: "evento-13.jpg", alt: "GeekPop Night — foto 13", caption: "Foto 13" },
    { file: "evento-14.jpg", alt: "GeekPop Night — foto 14", caption: "Foto 14" },
    { file: "evento-15.jpg", alt: "GeekPop Night — foto 15", caption: "Foto 15" },
    { file: "evento-16.jpg", alt: "GeekPop Night — foto 16", caption: "Foto 16" },
    { file: "evento-17.jpg", alt: "GeekPop Night — foto 17", caption: "Foto 17" },
    { file: "evento-18.jpg", alt: "GeekPop Night — foto 18", caption: "Foto 18" },
    { file: "evento-19.jpg", alt: "GeekPop Night — foto 19", caption: "Foto 19" },
    { file: "evento-20.jpg", alt: "GeekPop Night — foto 20", caption: "Foto 20" },
    { file: "evento-21.jpg", alt: "GeekPop Night — foto 21", caption: "Foto 21" },
    { file: "evento-22.jpg", alt: "GeekPop Night — foto 22", caption: "Foto 22" },
    { file: "evento-23.jpg", alt: "GeekPop Night — foto 23", caption: "Foto 23" },
    { file: "evento-24.jpg", alt: "GeekPop Night — foto 24", caption: "Foto 24" },
    { file: "evento-25.jpg", alt: "GeekPop Night — foto 25", caption: "Foto 25" },
    { file: "evento-26.jpg", alt: "GeekPop Night — foto 26", caption: "Foto 26" },
    { file: "evento-27.jpg", alt: "GeekPop Night — foto 27", caption: "Foto 27" },
    { file: "evento-28.jpg", alt: "GeekPop Night — foto 28", caption: "Foto 28" },
    { file: "evento-29.jpg", alt: "GeekPop Night — foto 29", caption: "Foto 29" },
    { file: "evento-30.jpg", alt: "GeekPop Night — foto 30", caption: "Foto 30" },
    { file: "evento-31.jpg", alt: "GeekPop Night — foto 31", caption: "Foto 31" },
    { file: "evento-32.jpg", alt: "GeekPop Night — foto 32", caption: "Foto 32" },
    { file: "evento-33.jpg", alt: "GeekPop Night — foto 33", caption: "Foto 33" },
    { file: "evento-34.jpg", alt: "GeekPop Night — foto 34", caption: "Foto 34" },
    { file: "evento-35.jpg", alt: "GeekPop Night — foto 35", caption: "Foto 35" },
  ],
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
