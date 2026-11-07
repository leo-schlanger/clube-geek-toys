import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FALLBACK_EVENT, type EventConfig } from '../../data/event'

const getMyReservations = vi.fn()
vi.mock('../../lib/event-tickets', () => ({ getMyReservations: () => getMyReservations() }))
const activeEvent = vi.fn()
vi.mock('../../hooks/useActiveEvent', () => ({ useActiveEvent: () => activeEvent() }))

import { MemberEvents } from './MemberEvents'

const event: EventConfig = {
  ...FALLBACK_EVENT,
  id: 'ev1',
  title: 'K-pop Day',
  startsAt: '2026-12-13T17:00:00Z',
  endsAt: '2026-12-13T23:00:00Z',
  ticketReservation: { ...FALLBACK_EVENT.ticketReservation, enabled: true, priceBRL: 25 },
}

function ticket(code: string, eventId: string, kind: 'member' | 'full' = 'member', status: 'valid' | 'used' = 'valid') {
  return { code, attendeeName: `Pessoa ${code}`, kind, status, usedAt: null, event: { id: eventId, title: `Evento ${eventId}`, startsAt: '', locationName: '', locationAddress: '' } }
}

function renderEvents(paused = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemberEvents paused={paused} />
    </QueryClientProvider>
  )
}

describe('MemberEvents', () => {
  beforeEach(() => {
    getMyReservations.mockReset()
    activeEvent.mockReturnValue({ event, visible: true, loading: false, isPlaceholder: false })
  })

  it('shows the half price and the tickets for this event, linking each to its public page', async () => {
    getMyReservations.mockResolvedValue([
      { code: 'R1', status: 'confirmed', tickets: [ticket('GPT-1', 'ev1'), ticket('GPT-2', 'ev1', 'full')] },
      { code: 'R0', status: 'confirmed', tickets: [ticket('OLD-1', 'ev0', 'member', 'used')] },
    ])
    renderEvents()
    expect(await screen.findByText('Membro paga R$ 12,50 (meia)')).toBeInTheDocument()
    expect(screen.getByText('Meia de membro · GPT-1')).toBeInTheDocument()
    expect(screen.getByText('Inteira · GPT-2')).toBeInTheDocument()
    expect(screen.getByText('Pessoa GPT-1').closest('a')).toHaveAttribute('href', expect.stringMatching(/\/ingresso\/GPT-1$/))
    expect(screen.getByText('Ingressos de eventos anteriores (1)')).toBeInTheDocument()
    expect(screen.queryByText('Garantir meu ingresso')).not.toBeInTheDocument()
  })

  it('no ticket yet: big button to the event page', async () => {
    getMyReservations.mockResolvedValue([])
    renderEvents()
    expect((await screen.findByText('Garantir meu ingresso')).closest('a')).toHaveAttribute('href', expect.stringMatching(/\/evento$/))
  })

  it('pending reservation: Aguardando PIX, linking to the payment page', async () => {
    getMyReservations.mockResolvedValue([{ code: 'R9', status: 'pending', tickets: [ticket('GPT-9', 'ev1')] }])
    renderEvents()
    expect(await screen.findByText('Aguardando PIX')).toBeInTheDocument()
    expect(screen.getByText('Pessoa GPT-9').closest('a')).toHaveAttribute('href', expect.stringMatching(/\/ingressos\/R9$/))
  })

  it('expired membership: the half price says it comes back on renewal', async () => {
    getMyReservations.mockResolvedValue([])
    renderEvents(true)
    expect(await screen.findByText('Meia de membro volta ao renovar')).toBeInTheDocument()
  })

  it('no event on the bill: one dashed line', async () => {
    activeEvent.mockReturnValue({ event, visible: false, loading: false, isPlaceholder: false })
    getMyReservations.mockResolvedValue([])
    renderEvents()
    expect(await screen.findByText(/Nenhum evento anunciado agora/)).toBeInTheDocument()
  })
})
