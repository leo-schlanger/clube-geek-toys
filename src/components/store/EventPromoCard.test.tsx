import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../data/event', async () => {
  const actual = await vi.importActual<typeof import('../../data/event')>('../../data/event')
  return {
    ...actual,
    isEventVisible: () => true,
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
