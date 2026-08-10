import { describe, it, expect } from 'vitest'
import {
  ACTIVE_EVENT,
  isEventVisible,
  formatEventDateRange,
  photoPublicUrl,
  buildReservationWhatsAppUrl,
} from './event'

describe('event data', () => {
  it('ACTIVE_EVENT is enabled for Sept 2026', () => {
    expect(ACTIVE_EVENT.enabled).toBe(true)
    expect(ACTIVE_EVENT.startsAt).toContain('2026-09-06')
    expect(ACTIVE_EVENT.ticketReservation.priceBRL).toBe(20)
  })

  it('isEventVisible follows enabled flag', () => {
    expect(isEventVisible()).toBe(true)
    expect(isEventVisible({ ...ACTIVE_EVENT, enabled: false })).toBe(false)
  })

  it('formatEventDateRange with and without end', () => {
    const withEnd = formatEventDateRange(ACTIVE_EVENT.startsAt, ACTIVE_EVENT.endsAt)
    expect(withEnd).toMatch(/2026/)
    expect(withEnd).toMatch(/–/)
    const noEnd = formatEventDateRange(ACTIVE_EVENT.startsAt)
    expect(noEnd).toMatch(/2026/)
    expect(noEnd).not.toMatch(/–/)
  })

  it('photoPublicUrl', () => {
    expect(photoPublicUrl(ACTIVE_EVENT, 'foto 1.jpg')).toBe(
      `/eventos/${ACTIVE_EVENT.slug}/foto%201.jpg`
    )
  })

  it('buildReservationWhatsAppUrl encodes message', () => {
    const url = buildReservationWhatsAppUrl({
      event: ACTIVE_EVENT,
      name: 'Leo',
      phone: '21999999999',
      email: 'a@b.com',
      quantity: 2,
      notes: 'obs',
    })
    expect(url).toMatch(/^https:\/\/wa\.me\//)
    expect(url).toContain(ACTIVE_EVENT.ticketReservation.whatsappNumber)
    expect(decodeURIComponent(url)).toMatch(/Leo|ingresso|obs/i)
  })
})
