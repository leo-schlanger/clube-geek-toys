import { api } from './api-client'
import { FALLBACK_EVENT, type EventConfig } from '../data/event'

/**
 * Cadastro de eventos.
 *
 * A vitrine lê `getActiveEvent()`; a aba **Eventos** do admin usa o resto.
 * Trocar de evento deixou de ser deploy: é uma linha no banco.
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
 * Público. `null` = nada em cartaz (a admin arquivou tudo) — e isso precisa
 * chegar como `null`, não como fallback, senão o evento encerrado volta ao ar.
 *
 * O fallback embutido cobre só a **falha de rede**: aí a loja mantém a campanha
 * em vez de sumir com o banner por causa de um timeout.
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

/** Base para o próximo evento: nasce rascunho, sem banner e com reservas fechadas. */
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

/** Upload do flyer. Multipart, então não passa pelo helper JSON. */
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
