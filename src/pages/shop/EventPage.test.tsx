import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const mockIsEventVisible = vi.fn()

vi.mock('../../data/event', () => ({
  ACTIVE_EVENT: {
    id: 'e1',
    slug: 'kpop-night',
    enabled: true,
    title: 'GeekPop Night',
    shortTitle: 'Night',
    bannerText: 'Evento',
    startsAt: '2026-09-06T14:00:00-03:00',
    endsAt: '2026-09-06T18:00:00-03:00',
    location: {
      name: 'GeekPop & Toys',
      address: 'Copacabana, RJ',
      mapsUrl: 'https://maps.example',
    },
    description: ['Festa K-pop'],
    highlights: ['Brinde'],
    memberPerk: 'Entrada grátis',
    ticketReservation: {
      enabled: true,
      priceBRL: 20,
      maxPerReservation: 4,
      whatsappNumber: '5511914662881',
    },
    photos: [],
  },
  formatEventDateRange: () => '6 de setembro de 2026',
  isEventVisible: (...args: unknown[]) => mockIsEventVisible(...args),
}))

vi.mock('../../components/store/useShopMember', () => ({
  useShopMember: () => ({ isMember: false }),
}))

vi.mock('../../components/store/ShopHeader', () => ({
  ShopHeader: () => <header data-testid="shop-header" />,
}))

vi.mock('../../components/store/EventTicketForm', () => ({
  EventTicketForm: () => <div data-testid="ticket-form">Form</div>,
}))

import EventPage from './EventPage'

describe('EventPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects home when event not visible', () => {
    mockIsEventVisible.mockReturnValue(false)
    render(
      <MemoryRouter initialEntries={['/evento']}>
        <Routes>
          <Route path="/evento" element={<EventPage />} />
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('renders event info and ticket form when visible', () => {
    mockIsEventVisible.mockReturnValue(true)
    render(
      <MemoryRouter initialEntries={['/evento']}>
        <Routes>
          <Route path="/evento" element={<EventPage />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByRole('heading', { name: 'GeekPop Night' })).toBeInTheDocument()
    expect(screen.getAllByText(/GeekPop & Toys/).length).toBeGreaterThan(0)
    expect(screen.getByTestId('ticket-form')).toBeInTheDocument()
    expect(screen.getByText(/Voltar à loja/i)).toBeInTheDocument()
  })
})

