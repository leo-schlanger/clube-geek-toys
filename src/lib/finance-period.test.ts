import { describe, it, expect } from 'vitest'
import { previousMonth, resolveFinanceQuery, todayInRio } from './finance-period'

describe('todayInRio', () => {
  // At 22h in Rio the UTC date is already tomorrow: "Hoje" must stay on the shop's day.
  it('uses the Rio calendar, not UTC', () => {
    expect(todayInRio(new Date('2026-10-17T01:30:00Z'))).toBe('2026-10-16')
  })
})

describe('previousMonth', () => {
  it('goes back one month, across the year', () => {
    expect(previousMonth('2026-10-16')).toBe('2026-09')
    expect(previousMonth('2026-01-05')).toBe('2025-12')
  })
})

describe('resolveFinanceQuery', () => {
  const today = '2026-10-16'

  it('maps the shortcuts to calendar periods', () => {
    expect(resolveFinanceQuery('today', {}, today)).toEqual({ period: 'day', date: today })
    expect(resolveFinanceQuery('this_month', {}, today)).toEqual({ period: 'month', date: today })
    expect(resolveFinanceQuery('last_month', {}, today)).toEqual({ period: 'month', date: '2026-09-01' })
    expect(resolveFinanceQuery('this_year', {}, today)).toEqual({ period: 'year', date: today })
  })

  it('reports any month the admin picks', () => {
    expect(resolveFinanceQuery('month', { month: '2026-08' }, today)).toEqual({ period: 'month', date: '2026-08-01' })
    expect(resolveFinanceQuery('month', { month: '' }, today)).toBeNull()
    // Typed by hand where there is no month picker; the API would refuse it.
    expect(resolveFinanceQuery('month', { month: '2026-13' }, today)).toBeNull()
    expect(resolveFinanceQuery('month', { month: '2026-00' }, today)).toBeNull()
  })

  it('sends a custom range only when it makes sense', () => {
    expect(resolveFinanceQuery('range', { start: '2026-09-10', end: '2026-10-16' }, today)).toEqual({
      period: 'range',
      range: { start: '2026-09-10', end: '2026-10-16' },
    })
    expect(resolveFinanceQuery('range', { start: '2026-10-16', end: '2026-09-10' }, today)).toBeNull()
    expect(resolveFinanceQuery('range', { start: '2026-10-16', end: '' }, today)).toBeNull()
  })
})
