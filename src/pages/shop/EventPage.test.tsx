import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// Event comes from the API via `useActiveEvent`. `isPlaceholder: false` is
// what unlocks the redirect: with the fallback still on screen the page
// must not kick anyone out.
const mockUseActiveEvent = vi.fn()

const EVENT = {
  id: 'e1',
  slug: 'kpop-night',
  status: 'published' as const,
  title: 'GeekPop Night',
  shortTitle: 'Night',
  bannerText: 'Evento',
  bannerImageUrl: null,
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
    currencyLabel: 'R$',
    maxPerReservation: 4,
    whatsappNumber: '5511914662881',
    notes: null,
  },
  priceCents: 2000,
}

vi.mock('../../data/event', async () => {
  const actual = await vi.importActual<typeof import('../../data/event')>('../../data/event')
  return { ...actual, formatEventDateRange: () => '6 de setembro de 2026' }
})

vi.mock('../../hooks/useActiveEvent', () => ({
  useActiveEvent: () => mockUseActiveEvent(),
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
    mockUseActiveEvent.mockReturnValue({
      event: { ...EVENT, status: 'archived' },
      visible: false,
      loading: false,
      isPlaceholder: false,
    })
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
    mockUseActiveEvent.mockReturnValue({
      event: EVENT,
      visible: true,
      loading: false,
      isPlaceholder: false,
    })
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

  function renderPage(event: Record<string, unknown>) {
    mockUseActiveEvent.mockReturnValue({ event, visible: true, loading: false, isPlaceholder: false })
    render(
      <MemoryRouter initialEntries={['/evento']}>
        <Routes>
          <Route path="/evento" element={<EventPage />} />
        </Routes>
      </MemoryRouter>
    )
  }

  // What ticketing pages put on the first screen: when, where, how much.
  it('answers date, time, place and price in the hero, in Rio time', () => {
    renderPage(EVENT)
    const hero = screen.getByRole('region', { name: 'GeekPop Night' })
    expect(within(hero).getByText('Domingo, 6 de setembro de 2026')).toBeInTheDocument()
    expect(within(hero).getByText('14h às 18h')).toBeInTheDocument()
    expect(within(hero).getByText('GeekPop & Toys')).toBeInTheDocument()
    expect(within(hero).getByText('R$ 20 por pessoa')).toBeInTheDocument()
    expect(within(hero).getByText('Membros do Clube: R$ 10')).toBeInTheDocument()
    expect(within(hero).getByRole('link', { name: /Reservar ingresso/ })).toHaveAttribute(
      'href',
      '#ingressos'
    )
  })

  // Laura's ask: both posters, and the competition sign-up form next to them.
  it('shows the cover in the hero and the other flyers with the link buttons', () => {
    renderPage({
      ...EVENT,
      bannerImageUrl: 'https://api.example/uploads/events/e1/banner-1.jpg',
      flyers: [{ url: 'https://api.example/uploads/events/e1/flyer-1.jpg' }],
      links: [{ label: 'Inscrição da competição', url: 'https://forms.gle/abc' }],
    })

    const hero = screen.getByRole('region', { name: 'GeekPop Night' })
    expect(within(hero).getByRole('img')).toHaveAttribute(
      'src',
      'https://api.example/uploads/events/e1/banner-1.jpg'
    )

    const more = screen.getByRole('region', { name: 'Mais sobre o evento' })
    expect(within(more).getByRole('img')).toHaveAttribute(
      'src',
      'https://api.example/uploads/events/e1/flyer-1.jpg'
    )
    const signUp = within(more).getByRole('link', { name: /Inscrição da competição/ })
    expect(signUp).toHaveAttribute('href', 'https://forms.gle/abc')
    expect(signUp).toHaveAttribute('target', '_blank')
    expect(signUp).toHaveAttribute('rel', expect.stringContaining('noopener'))
    // Also in the hero, next to "Reservar ingresso".
    expect(within(hero).getByRole('link', { name: /Inscrição da competição/ })).toBeInTheDocument()
  })

  it('never renders a link that is not http(s)', () => {
    renderPage({
      ...EVENT,
      links: [
        { label: 'Mal', url: 'javascript:alert(1)' },
        { label: 'Ok', url: 'https://forms.gle/ok' },
      ],
    })
    expect(screen.queryByRole('link', { name: 'Mal' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ok/ })).toHaveAttribute('href', 'https://forms.gle/ok')
  })

  it('keeps a reserve bar on phones while reservations are open', () => {
    renderPage(EVENT)
    expect(screen.getByTestId('mobile-reserve-bar')).toBeInTheDocument()
  })

  it('says reservations are closed and drops every reserve button', () => {
    renderPage({ ...EVENT, ticketReservation: { ...EVENT.ticketReservation, enabled: false } })
    expect(screen.getByText('Reservas encerradas')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Reservar/ })).not.toBeInTheDocument()
    expect(screen.queryByTestId('mobile-reserve-bar')).not.toBeInTheDocument()
  })

  it('draws no art for an event without flyers (older API payload)', () => {
    renderPage(EVENT)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Mais sobre o evento' })).not.toBeInTheDocument()
  })
})
