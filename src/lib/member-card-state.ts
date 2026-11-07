import type { Member, Order } from '../types'

/** Days left before a renewal warning shows on the member panel. */
export const RENEW_WARNING_DAYS = 30

export type CardStateKind = 'active' | 'soon' | 'expired'

export interface CardState {
  kind: CardStateKind
  /** Days until expiry (active/soon) or since expiry (expired, ≥ 0). */
  days: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Where the membership stands today. A status other than `active` counts as
 * expired whatever the date says: the door (/verificar) reads the same way.
 */
export function cardState(
  member: Pick<Member, 'status' | 'expiryDate'>,
  now: Date = new Date()
): CardState {
  const expiry = new Date(member.expiryDate).getTime()
  const left = Number.isNaN(expiry) ? 0 : Math.ceil((expiry - now.getTime()) / DAY_MS)
  if (member.status !== 'active' || left <= 0) return { kind: 'expired', days: Math.max(0, -left) }
  if (left <= RENEW_WARNING_DAYS) return { kind: 'soon', days: left }
  return { kind: 'active', days: left }
}

/** «26 de maio de 2027» */
export function longDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' })
}

/** «26/05/2027» */
export function shortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

/** «26/05» */
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
