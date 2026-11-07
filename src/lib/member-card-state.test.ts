import { describe, it, expect } from 'vitest'
import { cardChipLabel, cardState, civilDayMonth, civilShortDate, longDate } from './member-card-state'

// 09:00 in Rio on 07/11/2026.
const NOW = new Date('2026-11-07T12:00:00Z')
/** Civil date `days` after Rio's today. */
const at = (days: number) => new Date(Date.UTC(2026, 10, 7 + days, 12)).toISOString().slice(0, 10)

describe('cardState', () => {
  it('more than 30 days left is active', () => {
    expect(cardState({ status: 'active', expiryDate: at(200) }, NOW)).toEqual({ kind: 'active', days: 200 })
    expect(cardState({ status: 'active', expiryDate: at(31) }, NOW).kind).toBe('active')
  })

  it('0 to 30 days left is soon; the last day itself still counts', () => {
    expect(cardState({ status: 'active', expiryDate: at(30) }, NOW)).toEqual({ kind: 'soon', days: 30 })
    expect(cardState({ status: 'active', expiryDate: at(1) }, NOW)).toEqual({ kind: 'soon', days: 1 })
    expect(cardState({ status: 'active', expiryDate: at(0) }, NOW)).toEqual({ kind: 'soon', days: 0 })
  })

  it('past the date, or any status but active, is expired', () => {
    expect(cardState({ status: 'active', expiryDate: at(-5) }, NOW)).toEqual({ kind: 'expired', days: 5 })
    expect(cardState({ status: 'active', expiryDate: at(-1) }, NOW)).toEqual({ kind: 'expired', days: 1 })
    expect(cardState({ status: 'inactive', expiryDate: at(100) }, NOW).kind).toBe('expired')
    expect(cardState({ status: 'expired', expiryDate: at(100) }, NOW).kind).toBe('expired')
    expect(cardState({ status: 'active', expiryDate: 'nonsense' }, NOW).kind).toBe('expired')
  })

  it('the expiry day holds through 21:00–23:59 in Rio and ends at midnight', () => {
    const card = { status: 'active', expiryDate: '2027-11-07' } as const
    expect(cardState(card, new Date('2027-11-07T21:00:00-03:00')).kind).toBe('soon')
    expect(cardState(card, new Date('2027-11-07T23:59:59-03:00'))).toEqual({ kind: 'soon', days: 0 })
    expect(cardState(card, new Date('2027-11-08T00:00:00-03:00'))).toEqual({ kind: 'expired', days: 1 })
    // The old API shape (UTC midnight) reads as the same day.
    expect(cardState({ status: 'active', expiryDate: '2027-11-07T00:00:00.000Z' }, new Date('2027-11-07T22:00:00-03:00')).kind).toBe('soon')
  })

  it('chip text', () => {
    expect(cardChipLabel({ kind: 'active', days: 1 })).toBe('Em dia · faltam 1 dia')
    expect(cardChipLabel({ kind: 'soon', days: 12 })).toBe('Vence em 12 dias')
    expect(cardChipLabel({ kind: 'soon', days: 0 })).toBe('Vence hoje')
    expect(cardChipLabel({ kind: 'expired', days: 5 })).toBe('Vencida há 5 dias')
    expect(cardChipLabel({ kind: 'expired', days: 0 })).toBe('Vencida hoje')
  })
})

describe('civil date formatting', () => {
  it('shows the stored day, never the day before', () => {
    for (const v of ['2027-11-07', '2027-11-07T00:00:00.000Z']) {
      expect(civilShortDate(v)).toBe('07/11/2027')
      expect(civilDayMonth(v)).toBe('07/11')
      expect(longDate(v)).toBe('7 de novembro de 2027')
    }
    expect(civilShortDate('')).toBe('—')
  })
})
