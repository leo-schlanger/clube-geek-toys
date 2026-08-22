import { api } from './api-client'
import type { TicketKind } from '../data/event'

/**
 * Event tickets.
 *
 * Named ticket per person; door staff burns the code on entry.
 * On-screen PIX, manual settlement (no webhook): starts as `pending`.
 */

/** Reservation PIX. `emvCode` is the copy-paste payload and the QR content. */
export interface ReservationPix {
  emvCode: string
  pixKey: string
  merchantName: string
  amount: number
  txId: string
}

export type ReservationStatus = 'pending' | 'confirmed' | 'cancelled'
export type TicketStatus = 'pending' | 'valid' | 'used' | 'cancelled'

export interface EventTicket {
  id: string
  reservationId: string
  eventId: string
  code: string
  attendeeName: string
  kind: TicketKind
  priceCents: number
  status: TicketStatus
  usedAt: string | null
  createdAt: string
}

export interface EventReservation {
  id: string
  eventId: string
  code: string
  buyerName: string
  buyerEmail: string
  buyerPhone: string
  quantity: number
  totalCents: number
  status: ReservationStatus
  notes: string | null
  confirmedAt: string | null
  cancelledAt: string | null
  createdAt: string
  tickets?: EventTicket[]
  pix?: ReservationPix | null
}

export interface PublicTicket {
  code: string
  attendeeName: string
  kind: TicketKind
  status: TicketStatus
  usedAt: string | null
  event: {
    id: string
    title: string
    startsAt: string
    endsAt?: string
    locationName: string
    locationAddress: string
  }
}

export interface PublicReservation {
  code: string
  buyerName: string
  status: ReservationStatus
  quantity: number
  totalCents: number
  createdAt: string
  tickets: PublicTicket[]
  /** Present only while the reservation is still pending. */
  pix: ReservationPix | null
}

export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  pending: 'Aguardando pagamento',
  confirmed: 'Paga — ingressos liberados',
  cancelled: 'Cancelada',
}

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  pending: 'Aguardando confirmação do pagamento',
  valid: 'Válido',
  used: 'Já utilizado',
  cancelled: 'Cancelado',
}

export type CreateReservationResult =
  | { ok: true; reservation: EventReservation; ticketsUrl: string }
  | { ok: false; error: string }

export async function createReservation(
  eventId: string,
  input: {
    buyerName: string
    buyerEmail: string
    buyerPhone: string
    notes?: string
    attendees: { name: string; kind: TicketKind }[]
  }
): Promise<CreateReservationResult> {
  const result = await api.post<{ reservation: EventReservation; ticketsUrl: string }>(
    `/events/${eventId}/reservations`,
    input,
    { skipAuth: true }
  )
  return result.data
    ? { ok: true, reservation: result.data.reservation, ticketsUrl: result.data.ticketsUrl }
    : { ok: false, error: result.error || 'Não foi possível registrar a reserva.' }
}

/** Always sent to the reservation email; the API returns it masked. */
export async function resendPaymentLink(
  code: string
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const result = await api.post<{ sent: boolean; email: string }>(
    `/events/reservations/${code}/payment-link`,
    {},
    { skipAuth: true }
  )
  return result.data?.sent
    ? { ok: true, email: result.data.email }
    : { ok: false, error: result.error || 'Não foi possível reenviar o e-mail.' }
}

/** Logged-in customer's reservations — by account or signup email. */
export async function getMyReservations(): Promise<PublicReservation[]> {
  const result = await api.get<{ reservations: PublicReservation[] }>('/events/my-reservations')
  return result.data?.reservations ?? []
}

export async function getPublicTicket(code: string): Promise<PublicTicket | null> {
  const result = await api.get<{ ticket: PublicTicket }>(`/events/tickets/${code}`, {
    skipAuth: true,
  })
  return result.data?.ticket ?? null
}

export async function getPublicReservation(code: string): Promise<PublicReservation | null> {
  const result = await api.get<{ reservation: PublicReservation }>(
    `/events/reservations/${code}`,
    { skipAuth: true }
  )
  return result.data?.reservation ?? null
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export interface ReservationListResult {
  reservations: EventReservation[]
  total: number
  page: number
  limit: number
  summary: {
    pending: number
    confirmed: number
    cancelled: number
    ticketsValid: number
    ticketsUsed: number
  }
}

const EMPTY_LIST: ReservationListResult = {
  reservations: [],
  total: 0,
  page: 1,
  limit: 20,
  summary: { pending: 0, confirmed: 0, cancelled: 0, ticketsValid: 0, ticketsUsed: 0 },
}

export async function adminListReservations(
  params: { status?: ReservationStatus; search?: string; page?: number; limit?: number } = {}
): Promise<ReservationListResult> {
  const qs = new URLSearchParams()
  if (params.status) qs.set('status', params.status)
  if (params.search) qs.set('search', params.search)
  if (params.page) qs.set('page', String(params.page))
  if (params.limit) qs.set('limit', String(params.limit))
  const result = await api.get<ReservationListResult>(
    `/events/admin/reservations${qs.toString() ? `?${qs}` : ''}`
  )
  return result.data ?? EMPTY_LIST
}

export async function confirmReservation(id: string): Promise<EventReservation | null> {
  const result = await api.post<{ reservation: EventReservation }>(
    `/events/admin/reservations/${id}/confirm`,
    {}
  )
  return result.data?.reservation ?? null
}

export async function cancelReservation(
  id: string,
  reason?: string
): Promise<EventReservation | null> {
  const result = await api.post<{ reservation: EventReservation }>(
    `/events/admin/reservations/${id}/cancel`,
    reason ? { reason } : {}
  )
  return result.data?.reservation ?? null
}

export type CheckInResponse =
  | { ok: true; ticket: EventTicket; buyerName: string }
  | {
      ok: false
      reason: 'not_found' | 'already_used' | 'not_confirmed' | 'cancelled' | 'request_failed'
      message: string
      ticket?: EventTicket
      buyerName?: string
    }

/**
 * The ticket QR encodes its public URL. Door staff also type the code when
 * the camera fails, so both formats are accepted here.
 */
export function extractTicketCode(scanned: string): string {
  const trimmed = scanned.trim()
  const fromUrl = trimmed.match(/\/ingresso\/([^/?#\s]+)/i)
  return (fromUrl?.[1] ?? trimmed).toUpperCase()
}

/** One scan = one entry. A second read of the same code is already burned. */
export async function checkInTicket(code: string): Promise<CheckInResponse> {
  const result = await api.post<CheckInResponse>('/events/admin/check-in', { code })
  return (
    result.data ?? {
      ok: false,
      reason: 'request_failed',
      message: result.error || 'Não foi possível validar o ingresso.',
    }
  )
}
