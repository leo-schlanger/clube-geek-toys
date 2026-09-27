import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// The card reads the event from the hook (API). The bundled fallback is
// what the hook delivers on first render, so it is a valid fixture.
vi.mock('../../hooks/useActiveEvent', async () => {
  const { FALLBACK_EVENT } = await vi.importActual<typeof import('../../data/event')>(
    '../../data/event'
  )
  return {
    useActiveEvent: () => ({
      event: FALLBACK_EVENT,
      visible: true,
      loading: false,
      isPlaceholder: false,
    }),
  }
})

import { EventPromoCard } from './EventPromoCard'

describe('EventPromoCard', () => {
  it('renders event promo when visible', () => {
    render(
      <MemoryRouter>
        <EventPromoCard />
      </MemoryRouter>
    )
    const text = document.body.textContent || ''
    expect(/GeekPop|evento|ingresso|R\$/i.test(text)).toBe(true)
  })

  it('shows the poster and the facts, with the date written out', () => {
    render(
      <MemoryRouter>
        <EventPromoCard />
      </MemoryRouter>
    )
    // CSS `capitalize` used to print "20 De Setembro"; the text itself is right now.
    expect(document.body.textContent).toContain('Domingo, 20 de setembro')
    expect(document.body.textContent).toContain('14h às 18h')
    expect(document.body.textContent).toContain('R$ 20')
  })
})
