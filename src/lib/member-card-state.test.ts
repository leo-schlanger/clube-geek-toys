import { describe, it, expect } from 'vitest'
import { cardChipLabel, cardState } from './member-card-state'

const NOW = new Date('2026-11-07T12:00:00Z')
const at = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString()

describe('cardState', () => {
  it('more than 30 days left is active', () => {
    expect(cardState({ status: 'active', expiryDate: at(200) }, NOW)).toEqual({ kind: 'active', days: 200 })
    expect(cardState({ status: 'active', expiryDate: at(31) }, NOW).kind).toBe('active')
  })

  it('1 to 30 days left is soon', () => {
    expect(cardState({ status: 'active', expiryDate: at(30) }, NOW)).toEqual({ kind: 'soon', days: 30 })
    expect(cardState({ status: 'active', expiryDate: at(0.5) }, NOW)).toEqual({ kind: 'soon', days: 1 })
  })

  it('past the date, or any status but active, is expired', () => {
    expect(cardState({ status: 'active', expiryDate: at(-5) }, NOW)).toEqual({ kind: 'expired', days: 5 })
    expect(cardState({ status: 'inactive', expiryDate: at(100) }, NOW).kind).toBe('expired')
    expect(cardState({ status: 'expired', expiryDate: at(100) }, NOW).kind).toBe('expired')
    expect(cardState({ status: 'active', expiryDate: 'nonsense' }, NOW).kind).toBe('expired')
  })

  it('chip text', () => {
    expect(cardChipLabel({ kind: 'active', days: 1 })).toBe('Em dia · faltam 1 dia')
    expect(cardChipLabel({ kind: 'soon', days: 12 })).toBe('Vence em 12 dias')
    expect(cardChipLabel({ kind: 'expired', days: 5 })).toBe('Vencida há 5 dias')
    expect(cardChipLabel({ kind: 'expired', days: 0 })).toBe('Vencida hoje')
  })
})
