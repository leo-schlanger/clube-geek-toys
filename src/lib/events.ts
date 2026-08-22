import { api } from './api-client'
import { FALLBACK_EVENT, type EventConfig } from '../data/event'

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
