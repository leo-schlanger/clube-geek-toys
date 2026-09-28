import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const { getTicketMock, getReservationMock, polling } = vi.hoisted(() => ({
  getTicketMock: vi.fn(),
  getReservationMock: vi.fn(),
  polling: {
    active: false,
    onUpdate: null as null | ((r: unknown) => void),
  },
}))

vi.mock('../../hooks/useReservationPolling', () => ({
  useReservationPolling: (_code: unknown, active: boolean, onUpdate: (r: unknown) => void) => {
    polling.active = active
    polling.onUpdate = onUpdate
  },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

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

beforeEach(() => {
  vi.clearAllMocks()
  polling.active = false
  polling.onUpdate = null
})

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

  const pendingPagarme = {
    code: 'R-AAAA-BBBB',
    buyerName: 'Ana Souza',
    status: 'pending' as const,
    quantity: 1,
    totalCents: 2000,
    createdAt: '2026-09-28T12:00:00.000Z',
    tickets: [{ ...ticket, status: 'pending' as const }],
    paymentProvider: 'pagarme' as const,
    pixExpired: false,
    pix: {
      emvCode: '00020126PAGARME',
      pixKey: 'geekpopee@gmail.com',
      merchantName: 'GEEKPOP E TOYS',
      amount: 20,
      txId: 'ch_1',
      provider: 'pagarme' as const,
    },
  }

  it('PIX da Pagar.me: espera o pagamento e libera os ingressos na mesma tela', async () => {
    getReservationMock.mockResolvedValue(pendingPagarme)
    renderAt('/ingressos/R-AAAA-BBBB', 'reservation')

    expect(await screen.findByText(/esta página atualiza sozinha/i)).toBeInTheDocument()
    expect(polling.active).toBe(true)
    // Paying by key never reaches the charge: the key is not offered.
    expect(screen.queryByText('geekpopee@gmail.com')).not.toBeInTheDocument()

    act(() =>
      polling.onUpdate!({
        ...pendingPagarme,
        status: 'confirmed',
        pix: null,
        tickets: [{ ...ticket, status: 'valid' }],
      })
    )

    expect(await screen.findByText(/Pagamento confirmado\./)).toBeInTheDocument()
    expect(screen.queryByText(/esta página atualiza sozinha/i)).not.toBeInTheDocument()
  })

  it('PIX vencido: some o QR e a página oferece nova reserva', async () => {
    getReservationMock.mockResolvedValue({ ...pendingPagarme, pix: null, pixExpired: true })
    renderAt('/ingressos/R-AAAA-BBBB', 'reservation')

    expect(await screen.findByText('O PIX desta reserva expirou.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Fazer nova reserva' })).toHaveAttribute(
      'href',
      '/evento#ingressos'
    )
    expect(polling.active).toBe(false)
  })

  it('PIX manual antigo continua mostrando a chave e não espera sozinho', async () => {
    getReservationMock.mockResolvedValue({
      ...pendingPagarme,
      paymentProvider: 'local',
      pix: { ...pendingPagarme.pix, provider: 'local' },
    })
    renderAt('/ingressos/R-AAAA-BBBB', 'reservation')

    expect(await screen.findByText('geekpopee@gmail.com')).toBeInTheDocument()
    expect(polling.active).toBe(false)
  })
})
