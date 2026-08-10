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

import { EventAnnouncementBanner } from './EventAnnouncementBanner'

describe('EventAnnouncementBanner', () => {
  it('renders banner text when event visible', () => {
    render(
      <MemoryRouter>
        <EventAnnouncementBanner />
      </MemoryRouter>
    )
    expect(document.body.textContent).toMatch(/GeekPop|setembro|ingresso|R\$/i)
  })
})
