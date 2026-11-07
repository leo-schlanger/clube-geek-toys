import { describe, it, expect } from 'vitest'
import { daysUntilExpiry, formatCivilDate, isExpiryCurrent, rioToday, toDateOnly } from './club-date'
import { addClubPeriod } from '../types'

const rio = (local: string) => new Date(`${local}-03:00`)

describe('club civil dates (front)', () => {
  it("today is Rio's, on both sides of Rio's midnight", () => {
    expect(rioToday(rio('2026-11-07T21:00:00'))).toBe('2026-11-07')
    expect(rioToday(rio('2026-11-07T23:59:59'))).toBe('2026-11-07')
    expect(rioToday(rio('2026-11-08T00:00:00'))).toBe('2026-11-08')
  })

  it('the expiry day is valid until 23:59:59 in Rio', () => {
    for (const t of ['2026-11-07T00:00:00', '2026-11-07T21:00:00', '2026-11-07T23:59:59']) {
      expect(isExpiryCurrent('2026-11-07', rio(t))).toBe(true)
      expect(daysUntilExpiry('2026-11-07', rio(t))).toBe(0)
    }
    expect(isExpiryCurrent('2026-11-07', rio('2026-11-08T00:00:00'))).toBe(false)
    expect(daysUntilExpiry('2026-11-07', rio('2026-11-08T00:00:00'))).toBe(-1)
    expect(daysUntilExpiry('2027-11-07', rio('2026-11-07T22:00:00'))).toBe(365)
    expect(isExpiryCurrent(null)).toBe(false)
    expect(isExpiryCurrent('nonsense')).toBe(false)
  })

  it('formats the stored day whatever the shape', () => {
    expect(toDateOnly('2027-11-07T00:00:00.000Z')).toBe('2027-11-07')
    expect(formatCivilDate('2027-11-07')).toBe('07/11/2027')
    expect(formatCivilDate('2027-08-16T00:00:00.000Z')).toBe('16/08/2027')
    expect(formatCivilDate(null)).toBe('—')
  })

  it('one paid period is a year on the calendar', () => {
    expect(addClubPeriod('2026-11-07')).toBe('2027-11-07')
    expect(addClubPeriod('2028-02-29')).toBe('2029-03-01')
  })
})
