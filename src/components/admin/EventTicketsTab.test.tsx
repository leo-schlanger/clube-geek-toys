/**
 * EventTicketsTab — one event at a time.
 *
 * Counters, the purchase list and each ticket's situation belong to the event
 * picked at the top; finished events live under "Histórico".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { EventConfig } from '../../data/event'
import type { EventReservation, ReservationListResult } from '../../lib/event-tickets'

const mocks = vi.hoisted(() => ({
  listEvents: vi.fn(),
  adminListReservations: vi.fn(),
  checkInTicket: vi.fn(),
}))

vi.mock('../../lib/events', async () => {
  const actual = await vi.importActual<typeof import('../../lib/events')>('../../lib/events')
  return { ...actual, listEvents: mocks.listEvents }
})
vi.mock('../../lib/event-tickets', async () => {
  const actual = await vi.importActual<typeof import('../../lib/event-tickets')>(
    '../../lib/event-tickets'
  )
  return {
    ...actual,
    adminListReservations: mocks.adminListReservations,
    checkInTicket: mocks.checkInTicket,
    confirmReservation: vi.fn(),
    cancelReservation: vi.fn(),
  }
})
vi.mock('../../lib/api-client', () => ({ api: {} }))
vi.mock('../QRScanner', () => ({ QRScanner: () => null }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { EventTicketsTab } from './EventTicketsTab'

function event(overrides: Partial<EventConfig>): EventConfig {
  return {
    id: 'x',
    slug: 'x',
    status: 'published',
    title: 'X',
    shortTitle: 'X',
    bannerText: '',
    bannerImageUrl: null,
    flyers: [],
    links: [],
    startsAt: '2026-10-11T14:00:00-03:00',
    endsAt: '2026-10-11T18:00:00-03:00',
    location: { name: '', address: '', mapsUrl: null },
    description: [],
    highlights: [],
    memberPerk: null,
    ...overrides,
  } as EventConfig
}

const PAST = event({
  id: 'kpop-night',
  status: 'archived',
  title: 'Photocard Trading',
  startsAt: '2026-09-20T14:00:00-03:00',
  endsAt: '2026-09-20T18:00:00-03:00',
})
const NEXT = event({ id: 'evento-geekpop', title: 'Evento GeeKpop!' })

function reservation(eventId: string): EventReservation {
  return {
    id: `r-${eventId}`,
    eventId,
    code: 'R-AAAA',
    buyerName: 'Ana Souza',
    buyerEmail: 'ana@example.com',
    buyerPhone: '21999999999',
    quantity: 2,
    totalCents: 4000,
    status: 'confirmed',
    notes: null,
    paymentProvider: 'pagarme',
    confirmedAt: '2026-09-18T12:00:00Z',
    cancelledAt: null,
    createdAt: '2026-09-18T12:00:00Z',
    tickets: [
      {
        id: 't1',
        reservationId: `r-${eventId}`,
        eventId,
        code: 'T-1',
        attendeeName: 'Ana Souza',
        kind: 'full',
        priceCents: 2000,
        status: 'used',
        usedAt: '2026-09-20T17:32:00Z',
        createdAt: '2026-09-18T12:00:00Z',
      },
      {
        id: 't2',
        reservationId: `r-${eventId}`,
        eventId,
        code: 'T-2',
        attendeeName: 'Bia Lima',
        kind: 'full',
        priceCents: 2000,
        status: 'valid',
        usedAt: null,
        createdAt: '2026-09-18T12:00:00Z',
      },
    ],
  }
}

function listFor(eventId?: string): ReservationListResult {
  return {
    reservations: eventId ? [reservation(eventId)] : [],
    total: eventId ? 1 : 0,
    page: 1,
    limit: 20,
    summary:
      eventId === PAST.id
        ? { pending: 0, confirmed: 11, cancelled: 1, ticketsValid: 8, ticketsUsed: 18 }
        : { pending: 2, confirmed: 1, cancelled: 0, ticketsValid: 1, ticketsUsed: 0 },
  }
}

describe('EventTicketsTab', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-28T12:00:00-03:00'))
    mocks.listEvents.mockResolvedValue([PAST, NEXT])
    mocks.adminListReservations.mockImplementation(async (p: { eventId?: string }) =>
      listFor(p.eventId)
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('abre no próximo evento, só nas compras pagas', async () => {
    render(<EventTicketsTab />)

    await waitFor(() =>
      expect(mocks.adminListReservations).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: 'evento-geekpop', status: 'confirmed' })
      )
    )
    expect(mocks.adminListReservations).toHaveBeenCalledTimes(1)
    const select = screen.getByLabelText('Evento') as HTMLSelectElement
    expect(select.value).toBe('evento-geekpop')
    expect(screen.getByText('Próximo evento')).toBeInTheDocument()
    expect(screen.getByText(/Portaria — check-in/)).toBeInTheDocument()
  })

  it('evento passado fica no grupo Histórico', async () => {
    render(<EventTicketsTab />)

    const select = await screen.findByLabelText('Evento')
    const history = select.querySelector('optgroup[label^="Histórico"]')!
    expect(within(history as HTMLElement).getByText(/Photocard Trading/)).toBeInTheDocument()
    const upcoming = select.querySelector('optgroup[label="Próximos eventos"]')!
    expect(within(upcoming as HTMLElement).getByText(/Evento GeeKpop!/)).toBeInTheDocument()
  })

  it('no próximo evento, diz quem já pagou e ainda não entrou', async () => {
    render(<EventTicketsTab />)

    expect(await screen.findByText('Pago — ainda não entrou')).toBeInTheDocument()
    expect(screen.getByText('Ainda vão entrar')).toBeInTheDocument()
    expect(screen.getByText('Paga')).toBeInTheDocument()
  })

  it('no histórico, esconde a portaria e mostra quem não compareceu', async () => {
    const user = userEvent.setup()
    render(<EventTicketsTab />)

    await user.selectOptions(await screen.findByLabelText('Evento'), 'kpop-night')

    await waitFor(() =>
      expect(mocks.adminListReservations).toHaveBeenLastCalledWith(
        expect.objectContaining({ eventId: 'kpop-night' })
      )
    )
    expect(await screen.findByText('Não compareceu')).toBeInTheDocument()
    expect(screen.getByText('Entrou 20/09 às 14:32')).toBeInTheDocument()
    expect(screen.getByText('Não compareceram')).toBeInTheDocument()
    // 8 valid + 18 used
    expect(screen.getByText('26')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Este evento já aconteceu')
    expect(screen.queryByText(/Portaria — check-in/)).not.toBeInTheDocument()
  })

  it('"Todos os eventos juntos" não filtra por evento e diz de qual é cada compra', async () => {
    mocks.adminListReservations.mockImplementation(async (p: { eventId?: string }) =>
      p.eventId ? listFor(p.eventId) : listFor(PAST.id)
    )
    const user = userEvent.setup()
    render(<EventTicketsTab />)

    await user.selectOptions(await screen.findByLabelText('Evento'), '__all__')

    await waitFor(() =>
      expect(mocks.adminListReservations).toHaveBeenLastCalledWith(
        expect.objectContaining({ eventId: undefined })
      )
    )
    expect(await screen.findByText(/Evento: Photocard Trading/)).toBeInTheDocument()
    expect(screen.getByText('Não compareceu')).toBeInTheDocument()
  })

  it('portaria mostra de qual evento é o ingresso recusado', async () => {
    mocks.checkInTicket.mockResolvedValue({
      ok: false,
      reason: 'wrong_event',
      message: 'Este ingresso é de outro evento: Photocard Trading (20/09). Não vale para hoje.',
      buyerName: 'Ana Souza',
    })
    const user = userEvent.setup()
    render(<EventTicketsTab />)

    await screen.findByText('Próximo evento')
    await user.type(await screen.findByPlaceholderText('T-XXXX-XXXX-XXXX'), 'T-1')
    await user.click(screen.getByRole('button', { name: 'Validar' }))

    expect(await screen.findByText('ENTRADA NEGADA')).toBeInTheDocument()
    expect(screen.getByText(/de outro evento: Photocard Trading/)).toBeInTheDocument()
  })

  it('sem conseguir listar eventos, mostra tudo junto em vez de travar', async () => {
    mocks.listEvents.mockRejectedValue(new Error('offline'))
    render(<EventTicketsTab />)

    await waitFor(() =>
      expect(mocks.adminListReservations).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: undefined })
      )
    )
  })
})
