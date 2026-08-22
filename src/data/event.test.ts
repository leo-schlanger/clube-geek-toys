import { describe, it, expect } from 'vitest'
import {
  FALLBACK_EVENT,
  isEventVisible,
  formatEventDateRange,
  photoPublicUrl,
  buildReservationWhatsAppUrl,
} from './event'

describe('event data', () => {
  // Fallback only covers first paint, but must mirror the migration seed:
  // a mismatched fallback announces the wrong date until the API answers.
  it('FALLBACK_EVENT espelha o evento semeado pela migration 029', () => {
    expect(FALLBACK_EVENT.status).toBe('published')
    expect(FALLBACK_EVENT.startsAt).toContain('2026-09-20')
    expect(FALLBACK_EVENT.ticketReservation.priceBRL).toBe(20)
    expect(FALLBACK_EVENT.priceCents).toBe(2000)
  })

  it('isEventVisible só deixa passar o publicado', () => {
    expect(isEventVisible(FALLBACK_EVENT)).toBe(true)
    expect(isEventVisible({ ...FALLBACK_EVENT, status: 'draft' })).toBe(false)
    expect(isEventVisible({ ...FALLBACK_EVENT, status: 'archived' })).toBe(false)
    expect(isEventVisible(null)).toBe(false)
  })

  it('formatEventDateRange with and without end', () => {
    const withEnd = formatEventDateRange(FALLBACK_EVENT.startsAt, FALLBACK_EVENT.endsAt)
    expect(withEnd).toMatch(/2026/)
    expect(withEnd).toMatch(/–/)
    const noEnd = formatEventDateRange(FALLBACK_EVENT.startsAt)
    expect(noEnd).toMatch(/2026/)
    expect(noEnd).not.toMatch(/–/)
  })

  it('photoPublicUrl', () => {
    expect(photoPublicUrl(FALLBACK_EVENT, 'foto 1.jpg')).toBe(
      `/eventos/${FALLBACK_EVENT.slug}/foto%201.jpg`
    )
  })

  it('buildReservationWhatsAppUrl encodes message', () => {
    const url = buildReservationWhatsAppUrl({
      event: FALLBACK_EVENT,
      name: 'Leo',
      phone: '21999999999',
      email: 'a@b.com',
      attendees: [
        { name: 'Leo', kind: 'full' as const },
        { name: 'Ana', kind: 'member' as const },
      ],
      notes: 'obs',
    })
    expect(url).toMatch(/^https:\/\/wa\.me\//)
    expect(url).toContain(FALLBACK_EVENT.ticketReservation.whatsappNumber)
    expect(decodeURIComponent(url)).toMatch(/Leo|ingresso|obs/i)
  })
})
