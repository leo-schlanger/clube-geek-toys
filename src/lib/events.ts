import { api } from './api-client'
import { FALLBACK_EVENT, type EventConfig, type EventLink } from '../data/event'

/**
 * Event catalogue.
 *
 * The storefront reads `getActiveEvent()`; the admin **Eventos** tab uses the rest.
 * Switching events is a database row, not a deploy.
 */

export interface EventInput {
  title: string
  slug?: string
  status?: EventConfig['status']
  shortTitle?: string
  bannerText?: string
  bannerImageUrl?: string | null
  flyers?: { url: string }[]
  links?: EventLink[]
  startsAt: string
  endsAt?: string | null
  locationName?: string
  locationAddress?: string
  locationMapsUrl?: string | null
  description?: string[]
  highlights?: string[]
  memberPerk?: string | null
  reservationsOpen?: boolean
  priceCents?: number | null
  currencyLabel?: string
  maxPerReservation?: number | null
  whatsappNumber?: string
  reservationNotes?: string | null
}

/**
 * Public. `null` = nothing on the bill (admin archived everything) — and that
 * must arrive as `null`, not the fallback, or a closed event would come back.
 *
 * The bundled fallback covers **network failure** only: the shop keeps the
 * campaign instead of dropping the banner on a timeout.
 */
export async function getActiveEvent(): Promise<EventConfig | null> {
  try {
    const res = await api.get<{ event: EventConfig | null }>('/events/active')
    if (res.error) return FALLBACK_EVENT
    return res.data?.event ?? null
  } catch {
    return FALLBACK_EVENT
  }
}

export async function listEvents(): Promise<EventConfig[]> {
  const res = await api.get<{ events: EventConfig[] }>('/events/admin/events')
  return res.data?.events ?? []
}

export async function createEvent(input: EventInput): Promise<EventConfig> {
  const res = await api.post<{ event: EventConfig }>(
    '/events/admin/events',
    input as unknown as Record<string, unknown>
  )
  if (!res.data?.event) throw new Error(res.error || 'Falha ao criar evento.')
  return res.data.event
}

export async function updateEvent(id: string, input: Partial<EventInput>): Promise<EventConfig> {
  const res = await api.patch<{ event: EventConfig }>(
    `/events/admin/events/${encodeURIComponent(id)}`,
    input as unknown as Record<string, unknown>
  )
  if (!res.data?.event) throw new Error(res.error || 'Falha ao salvar evento.')
  return res.data.event
}

/** Seed for the next event: born as draft, no banner, reservations closed. */
export async function duplicateEvent(id: string): Promise<EventConfig> {
  const res = await api.post<{ event: EventConfig }>(
    `/events/admin/events/${encodeURIComponent(id)}/duplicate`
  )
  if (!res.data?.event) throw new Error(res.error || 'Falha ao duplicar evento.')
  return res.data.event
}

export async function deleteEvent(id: string): Promise<void> {
  const res = await api.delete(`/events/admin/events/${encodeURIComponent(id)}`)
  if (res.error) throw new Error(res.error)
}

/** Flyer upload. Multipart, so it skips the JSON helper. */
export async function uploadEventBanner(id: string, file: File): Promise<EventConfig> {
  const form = new FormData()
  form.append('banner', file)
  const res = await api.post<{ event: EventConfig; url: string }>(
    `/events/admin/events/${encodeURIComponent(id)}/banner`,
    undefined,
    { body: form }
  )
  if (!res.data?.event) throw new Error(res.error || 'Falha ao enviar o banner.')
  return res.data.event
}

/** One more flyer, appended after the ones already there. */
export async function uploadEventFlyer(id: string, file: File): Promise<EventConfig> {
  const form = new FormData()
  form.append('flyer', file)
  const res = await api.post<{ event: EventConfig; url: string }>(
    `/events/admin/events/${encodeURIComponent(id)}/flyers`,
    undefined,
    { body: form }
  )
  if (!res.data?.event) throw new Error(res.error || 'Falha ao enviar a imagem.')
  return res.data.event
}

/**
 * `forms.gle/abc` → `https://forms.gle/abc`. What gets pasted from a phone
 * often has no scheme, and the API only takes http(s).
 */
export function normalizeLinkUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed // other scheme: let validation refuse it
  return `https://${trimmed}`
}

/** Drops blank rows; a half-filled row is an error, not a silent drop. */
export function linksToPayload(links: EventLink[]): EventLink[] | { error: string } {
  const out: EventLink[] = []
  for (const link of links) {
    const label = link.label.trim()
    const url = normalizeLinkUrl(link.url)
    if (!label && !url) continue
    if (!label) return { error: 'Dê um texto ao botão do link.' }
    if (!url) return { error: `Falta o endereço do botão "${label}".` }
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error()
    } catch {
      return { error: `O link do botão "${label}" não é um endereço válido.` }
    }
    out.push({ label, url })
  }
  return out
}
