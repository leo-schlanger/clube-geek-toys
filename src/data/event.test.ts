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
    const during = Date.parse('2026-09-20T15:00:00-03:00')
    expect(isEventVisible(FALLBACK_EVENT, during)).toBe(true)
    expect(isEventVisible({ ...FALLBACK_EVENT, status: 'draft' }, during)).toBe(false)
    expect(isEventVisible({ ...FALLBACK_EVENT, status: 'archived' }, during)).toBe(false)
    expect(isEventVisible(null, during)).toBe(false)
  })

  // On 26/09 the 20/09 event was still on the site: the fallback is always a
  // past event, and a status-only rule never let it go.
  it('isEventVisible esconde o evento que já terminou', () => {
    const end = Date.parse(FALLBACK_EVENT.endsAt!)
    expect(isEventVisible(FALLBACK_EVENT, end)).toBe(true)
    expect(isEventVisible(FALLBACK_EVENT, end + 1)).toBe(false)
    expect(isEventVisible(FALLBACK_EVENT, Date.parse('2026-09-26T21:00:00-03:00'))).toBe(false)
  })

  it('sem término, o evento vale até 24h depois do início', () => {
    const event = { ...FALLBACK_EVENT, endsAt: null }
    const start = Date.parse(event.startsAt)
    expect(isEventVisible(event, start + 23 * 3600_000)).toBe(true)
    expect(isEventVisible(event, start + 25 * 3600_000)).toBe(false)
  })

  it('data ilegível não esconde um evento publicado', () => {
    expect(isEventVisible({ ...FALLBACK_EVENT, endsAt: 'amanhã' }, Date.now())).toBe(true)
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
