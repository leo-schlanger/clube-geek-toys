/**
 * Member DATE columns (`expiry_date`, `start_date`) are civil dates. The rule:
 * `expiry_date` is the last valid day, inclusive, until 23:59:59 in Rio.
 * Database and API run in UTC, so neither `CURRENT_DATE` nor `new Date()`
 * says what day it is at the shop. Mirrors `src/lib/club-date.ts`.
 */

export const CLUB_TZ = 'America/Sao_Paulo';

/** Rio's today as a SQL `date`. Use instead of CURRENT_DATE against member DATE columns. */
export const TODAY_RIO_SQL = `(NOW() AT TIME ZONE '${CLUB_TZ}')::date`;

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/** 'YYYY-MM-DD' from a DATE value (string from pg, or a Date at UTC midnight). */
export function toDateOnly(value: string | Date | null | undefined): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  const m = String(value).match(DATE_ONLY_RE);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Today on the Rio wall clock, as 'YYYY-MM-DD'. */
export function rioToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CLUB_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Still valid at `now`: the expiry day counts until 23:59:59 in Rio. */
export function isExpiryCurrent(expiry: string | Date | null | undefined, now: Date = new Date()): boolean {
  const day = toDateOnly(expiry);
  return day !== null && day >= rioToday(now);
}

/** A civil date in pt-BR, «07/11/2027». */
export function formatDateBR(value: string | Date | null | undefined): string {
  const day = toDateOnly(value);
  if (!day) return '';
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}
