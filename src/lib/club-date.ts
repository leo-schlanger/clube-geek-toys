/**
 * Member DATE columns (`expiry_date`, `start_date`) are civil dates, not
 * instants. `expiry_date` is the last valid day, inclusive, until 23:59:59 in
 * Rio. Never pass them through `new Date(...)` with a time zone: midnight UTC
 * is 21:00 of the day before in Rio. Mirrors `server/api/src/utils/club-date.ts`.
 */

export const CLUB_TZ = 'America/Sao_Paulo'

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})/
const DAY_MS = 24 * 60 * 60 * 1000

/** 'YYYY-MM-DD' from a DATE value; also reads the old '...T00:00:00.000Z' shape. */
export function toDateOnly(value: string | Date | null | undefined): string | null {
  if (value == null || value === '') return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10)
  const m = value.match(DATE_ONLY_RE)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/** Today on the Rio wall clock, as 'YYYY-MM-DD'. */
export function rioToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CLUB_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

function utcNoon(dateOnly: string): number {
  const [y, m, d] = dateOnly.split('-').map(Number)
  return Date.UTC(y, m - 1, d, 12)
}

/** Whole days from Rio's today to the last valid day: 0 on that day, -1 the day after. NaN when unknown. */
export function daysUntilExpiry(expiry: string | Date | null | undefined, now: Date = new Date()): number {
  const day = toDateOnly(expiry)
  if (!day) return Number.NaN
  return Math.round((utcNoon(day) - utcNoon(rioToday(now))) / DAY_MS)
}

/** Still valid at `now`: the expiry day counts until 23:59:59 in Rio. */
export function isExpiryCurrent(expiry: string | Date | null | undefined, now: Date = new Date()): boolean {
  return daysUntilExpiry(expiry, now) >= 0
}

/** A civil date in pt-BR: «07/11/2027» by default. */
export function formatCivilDate(
  value: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const day = toDateOnly(value)
  if (!day) return '—'
  return new Date(utcNoon(day)).toLocaleDateString('pt-BR', { ...options, timeZone: 'UTC' })
}
