import { describe, it, expect } from 'vitest'
import {
  CLUB_BREAK_EVEN_SPEND,
  CLUB_MONTHLY_EQUIVALENT,
  estimateClubYear,
  memberSavingsOn,
} from './club-value'

describe('club-value', () => {
  it('quotes the annual price per month', () => {
    expect(CLUB_MONTHLY_EQUIVALENT).toBe(13.33)
  })

  it('finds the yearly spend where the discount covers the plan', () => {
    expect(CLUB_BREAK_EVEN_SPEND).toBe(1599)
    expect(memberSavingsOn(CLUB_BREAK_EVEN_SPEND)).toBeGreaterThanOrEqual(159.9)
  })

  it('saves ten percent on products and never goes negative', () => {
    expect(memberSavingsOn(150)).toBe(15)
    expect(memberSavingsOn(-20)).toBe(0)
  })

  it('adds half of each ticket to the shop savings', () => {
    const year = estimateClubYear({ monthlySpend: 150, tickets: 2, ticketPrice: 20 })
    expect(year.shopSavings).toBe(180)
    expect(year.ticketSavings).toBe(20)
    expect(year.totalSavings).toBe(200)
    expect(year.net).toBe(40.1)
  })

  it('reports a shortfall when the plan has not paid off', () => {
    expect(estimateClubYear({ monthlySpend: 50, tickets: 0, ticketPrice: 20 }).net).toBe(-99.9)
  })
})
