import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// O card lê o evento pelo hook (que vem da API). O fallback embutido é o que
// o hook entrega no primeiro render, então serve de fixture.
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
