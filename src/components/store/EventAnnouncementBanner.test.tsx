import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { EventAnnouncementBanner } from './EventAnnouncementBanner'
import { FALLBACK_EVENT, isEventVisible } from '../../data/event'

// O evento passou a vir da API pelo `useActiveEvent`; o fallback embutido é
// exatamente o que o hook entrega no primeiro render. `importActual` porque
// `vi.mock` sobe acima dos imports — a constante ainda não existe aqui.
vi.mock('../../hooks/useActiveEvent', async () => {
  const actual = await vi.importActual<typeof import('../../data/event')>('../../data/event')
  return {
    useActiveEvent: () => ({
      event: actual.FALLBACK_EVENT,
      visible: true,
      loading: false,
      isPlaceholder: false,
    }),
  }
})

/**
 * The bug this pins: the banner was `sticky top-0 z-50` and `ShopHeader` is
 * `sticky top-0 z-40`. Both stuck to the SAME `top: 0`, and the banner, with
 * the higher z, covered the whole header as soon as the page scrolled. Cart,
 * login, search, theme and the wholesale link stopped responding at every
 * width tested, not only on mobile.
 *
 * The fix is keeping the banner in **normal flow**: it takes space at the top,
 * scrolls away, and the header owns `top: 0` alone.
 */

beforeEach(() => {
  cleanup()
  vi.mocked(localStorage.getItem).mockReturnValue(null)
})

function renderBanner() {
  return render(
    <MemoryRouter>
      <EventAnnouncementBanner />
    </MemoryRouter>
  )
}

describe('EventAnnouncementBanner da loja — empilhamento', () => {
  it('the event must be active, or this file tests nothing', () => {
    expect(isEventVisible(FALLBACK_EVENT)).toBe(true)
  })

  it('is NOT sticky: two sticky elements at top-0 fight and the header loses', () => {
    renderBanner()
    const banner = screen.getByRole('region', { name: /anúncio do evento/i })

    expect(banner.className).not.toMatch(/\bsticky\b/)
    expect(banner.className).not.toMatch(/\bfixed\b/)
  })

  it('no longer publishes the height variable, which nothing read', () => {
    renderBanner()
    // An in-flow element pushes content by itself; the old variable carried two
    // fixed numbers that never tracked the real text.
    expect(
      document.documentElement.style.getPropertyValue('--shop-event-banner-h')
    ).toBe('')
  })

  it('some quando o visitante dispensa', () => {
    // `localStorage` is a vi.fn() mock in this repo's setup, so `setItem` stores
    // nothing; the way in is teaching `getItem`.
    vi.mocked(localStorage.getItem).mockImplementation((k: string) =>
      k === `shop-event-banner-dismissed:${FALLBACK_EVENT.id}` ? '1' : null
    )
    renderBanner()

    expect(screen.queryByRole('region', { name: /anúncio do evento/i })).toBeNull()
  })
})
