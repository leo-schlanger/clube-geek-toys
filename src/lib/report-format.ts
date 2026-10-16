/**
 * Period labels shared by the PDF and the spreadsheet. Kept apart from both so
 * that loading one never drags the other's library (pdf-lib, exceljs) along.
 */

import type { OverviewPeriod, OverviewReport } from './reports'

/** YYYY-MM-DD of an instant on the Rio calendar. */
export function rioDate(isoValue: string): string {
  return new Date(isoValue).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/** Last day of the period, on the Rio calendar (the API's `end` is exclusive). */
export function lastDay(endIso: string): string {
  return rioDate(new Date(new Date(endIso).getTime() - 1).toISOString())
}

/** Inclusive end date — the API's `end` is the exclusive start of the next period. */
export function formatRange(period: OverviewPeriod, startIso: string, endIso: string): string {
  const start = new Date(startIso)
  const last = new Date(new Date(endIso).getTime() - 1)
  // Periods are cut on the Rio calendar (the API returns Rio midnights as instants).
  const date = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  if (period === 'day') return date(start)
  return `${date(start)} a ${date(last)}`
}

/** Shop + event tickets + club, for the period and the one before it. */
export function revenueTotals(report: OverviewReport): { current: number; previous: number } {
  const { sales, club, tickets, previous } = report
  return {
    current: sales.revenue + tickets.revenue + club.revenue,
    previous: previous.salesRevenue + previous.ticketRevenue + previous.clubRevenue,
  }
}

/** Filename stem with the period baked in, so a folder of them sorts by date. */
export function reportBasename(report: OverviewReport): string {
  const { type } = report.period
  // A Rio midnight is 03:00 UTC on the same date, so the UTC date is the Rio one.
  const start = report.period.start.slice(0, 10)
  if (type === 'range') return `relatorio-geekpop-periodo-${start}_a_${lastDay(report.period.end)}`
  const suffix = type === 'day' ? start : type === 'month' ? start.slice(0, 7) : start.slice(0, 4)
  return `relatorio-geekpop-${type}-${suffix}`
}
