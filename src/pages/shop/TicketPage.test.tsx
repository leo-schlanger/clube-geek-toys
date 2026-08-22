import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const { getTicketMock, getReservationMock } = vi.hoisted(() => ({
  getTicketMock: vi.fn(),
  getReservationMock: vi.fn(),
}))

vi.mock('../../lib/event-tickets', async () => {
  const actual = await vi.importActual<typeof import('../../lib/event-tickets')>(
    '../../lib/event-tickets'
  )
  return {
    ...actual,
    getPublicTicket: getTicketMock,
    getPublicReservation: getReservationMock,
  }
})

vi.mock('../../components/store/ShopHeader', () => ({
  ShopHeader: () => <header data-testid="shop-header" />,
}))

vi.mock('../../components/store/useShopMember', () => ({
  useShopMember: () => ({ isMember: false }),
}))

import TicketPage from './TicketPage'

const ticket = {
  code: 'T-AAAA-BBBB-CCCC',
  attendeeName: 'Ana Souza',
  kind: 'full' as const,
  status: 'valid' as const,
  usedAt: null,
  event: {
    id: 'kpop-night-2026-09-06',
    title: 'GeekPop Night',
    startsAt: '2026-09-06T14:00:00-03:00',
    endsAt: '2026-09-06T18:00:00-03:00',
    locationName: 'Copacabana Mar Hotel',
    locationAddress: 'Copacabana, RJ',
  },
}

function renderAt(path: string, mode: 'ticket' | 'reservation') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/ingresso/:code" element={<TicketPage mode={mode} />} />
        <Route path="/ingressos/:code" element={<TicketPage mode={mode} />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => vi.clearAllMocks())

describe('TicketPage', () => {
  it('mostra o ingresso avulso sem exigir login', async () => {
    getTicketMock.mockResolvedValue(ticket)
    renderAt('/ingresso/T-AAAA-BBBB-CCCC', 'ticket')

    expect(await screen.findByText('Ana Souza')).toBeInTheDocument()
    expect(getTicketMock).toHaveBeenCalledWith('T-AAAA-BBBB-CCCC')
  })

  it('lista todos os ingressos da reserva', async () => {
    getReservationMock.mockResolvedValue({
      code: 'R-AAAA-BBBB',
      buyerName: 'Ana Souza',
      status: 'confirmed',
      quantity: 2,
      totalCents: 4000,
      createdAt: '2026-08-21T12:00:00.000Z',
      tickets: [ticket, { ...ticket, code: 'T-DDDD-EEEE-FFFF', attendeeName: 'Bia Souza' }],
    })
    renderAt('/ingressos/R-AAAA-BBBB', 'reservation')

    expect(await screen.findByText('Bia Souza')).toBeInTheDocument()
    // Buyer name appears in the header and on her own ticket.
    expect(screen.getAllByText('Ana Souza').length).toBeGreaterThan(1)
  })

  it('explica quando o código não existe, em vez de tela em branco', async () => {
    getTicketMock.mockResolvedValue(null)
    renderAt('/ingresso/T-ZZZZ-ZZZZ-ZZZZ', 'ticket')

    expect(
      await screen.findByRole('heading', { name: /Ingresso não encontrado/i })
    ).toBeInTheDocument()
  })
})
