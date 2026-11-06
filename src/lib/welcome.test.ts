import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isWelcomePending, markWelcomeSeen, welcomeStorageKey } from './welcome'

const NOW = new Date('2026-11-06T12:00:00Z')

describe('isWelcomePending', () => {
  beforeEach(() => {
    vi.mocked(localStorage.getItem).mockReturnValue(null)
  })

  it('greets a member activated less than 7 days ago', () => {
    expect(isWelcomePending({ id: 'm1', activatedAt: '2026-11-01T12:00:01Z' }, NOW)).toBe(true)
  })

  it('stops after 7 days, so an old member on a new phone is not greeted', () => {
    expect(isWelcomePending({ id: 'm1', activatedAt: '2026-10-30T12:00:00Z' }, NOW)).toBe(false)
  })

  it('falls back to the start date when the activation date is missing', () => {
    expect(isWelcomePending({ id: 'm1', activatedAt: null, startDate: '2026-11-05' }, NOW)).toBe(true)
    expect(isWelcomePending({ id: 'm1' }, NOW)).toBe(false)
  })

  it('never shows again once seen in this browser', () => {
    vi.mocked(localStorage.getItem).mockReturnValue('1')
    expect(isWelcomePending({ id: 'm1', activatedAt: '2026-11-06T10:00:00Z' }, NOW)).toBe(false)
    expect(localStorage.getItem).toHaveBeenCalledWith(welcomeStorageKey('m1'))
  })

  it('marks the member as seen', () => {
    markWelcomeSeen('m1')
    expect(localStorage.setItem).toHaveBeenCalledWith('clube_geek_welcome_seen_m1', '1')
  })
})
