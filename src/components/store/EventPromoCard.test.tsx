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
})
