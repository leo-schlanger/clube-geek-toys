import type { Member, Order } from '../types'
import { daysUntilExpiry, formatCivilDate } from './club-date'

/** Days left before a renewal warning shows on the member panel. */
export const RENEW_WARNING_DAYS = 30

export type CardStateKind = 'active' | 'soon' | 'expired'

export interface CardState {
  kind: CardStateKind
  /** Days until the last valid day (0 = today, active/soon) or since it (expired, ≥ 0). */
  days: number
}

/**
 * Where the membership stands today. A status other than `active` counts as
 * expired whatever the date says: the door (/verificar) reads the same way.
 */
export function cardState(
  member: Pick<Member, 'status' | 'expiryDate'>,
  now: Date = new Date()
): CardState {
  // `expiryDate` is the last valid day, inclusive, on Rio's calendar.
  const days = daysUntilExpiry(member.expiryDate, now)
  const left = Number.isNaN(days) ? -1 : days
  if (member.status !== 'active' || left < 0) return { kind: 'expired', days: Math.max(0, -left) }
  if (left <= RENEW_WARNING_DAYS) return { kind: 'soon', days: left }
  return { kind: 'active', days: left }
}

/** «26 de maio de 2027», for a civil date (expiry, start). */
export function longDate(dateOnly: string): string {
  return formatCivilDate(dateOnly, { day: 'numeric', month: 'long', year: 'numeric' })
}

/** «26/05/2027», for a civil date (expiry, start). */
export function civilShortDate(dateOnly: string): string {
  return formatCivilDate(dateOnly)
}

/** «26/05», for a civil date (expiry, start). */
export function civilDayMonth(dateOnly: string): string {
  return formatCivilDate(dateOnly, { day: '2-digit', month: '2-digit' })
}

/** «26/05/2027», for an instant (order time) on Rio's clock. */
export function shortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

/** «26/05», for an instant (order time) on Rio's clock. */
export function dayMonth(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** Chip text under the card. */
export function cardChipLabel(state: CardState): string {
  if (state.kind === 'expired') {
    return state.days === 0 ? 'Vencida hoje' : `Vencida há ${plural(state.days, 'dia', 'dias')}`
  }
  if (state.days === 0) return 'Vence hoje'
  if (state.kind === 'soon') return `Vence em ${plural(state.days, 'dia', 'dias')}`
  return `Em dia · faltam ${plural(state.days, 'dia', 'dias')}`
}

export function formatMemberNumber(id: string): string {
  // Last 12 chars in groups of 4 like a card number
  const clean = id.replace(/-/g, '').slice(-12).toUpperCase()
  return `${clean.slice(0, 4)}  ${clean.slice(4, 8)}  ${clean.slice(8, 12)}`
}

/** Discount that came from membership (`member_10`), as opposed to a coupon or promo. */
export function memberSavings(order: Pick<Order, 'discount' | 'discountReason'>): number {
  return order.discountReason?.startsWith('member') && order.discount > 0 ? order.discount : 0
}
