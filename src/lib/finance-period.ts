import type { OverviewPeriod, OverviewRange } from './reports'

/** The shortcuts on the finance panel. */
export type FinancePreset = 'today' | 'this_month' | 'last_month' | 'this_year' | 'month' | 'range'

export interface FinanceQuery {
  period: OverviewPeriod
  date?: string
  range?: OverviewRange
}

/** Today on the shop's calendar — at 22h in Rio the browser's UTC date is already tomorrow. */
export function todayInRio(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/** YYYY-MM of the month before the one `today` falls in. */
export function previousMonth(today: string): string {
  const [y, m] = today.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ISO_MONTH = /^\d{4}-\d{2}$/

/**
 * Turn the panel's choice into the API query, or null while the choice is
 * incomplete (a range missing a date, an end before the start) — the panel
 * keeps the last report on screen instead of asking for nonsense.
 */
export function resolveFinanceQuery(
  preset: FinancePreset,
  input: { month?: string; start?: string; end?: string },
  today: string = todayInRio()
): FinanceQuery | null {
  switch (preset) {
    case 'today':
      return { period: 'day', date: today }
    case 'this_month':
      return { period: 'month', date: today }
    case 'last_month':
      return { period: 'month', date: `${previousMonth(today)}-01` }
    case 'this_year':
      return { period: 'year', date: today }
    case 'month':
      return input.month && ISO_MONTH.test(input.month) ? { period: 'month', date: `${input.month}-01` } : null
    case 'range': {
      const { start, end } = input
      if (!start || !end || !ISO_DATE.test(start) || !ISO_DATE.test(end) || start > end) return null
      return { period: 'range', range: { start, end } }
    }
  }
}
