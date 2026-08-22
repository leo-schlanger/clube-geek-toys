import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TicketCard } from './TicketCard'
import type { PublicTicket } from '../../lib/event-tickets'

const base: PublicTicket = {
  code: 'T-AAAA-BBBB-CCCC',
  attendeeName: 'Ana Souza',
  kind: 'full',
  status: 'valid',
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

describe('TicketCard', () => {
  it('mostra o nome de quem entra e o QR quando o ingresso está válido', () => {
    const { container } = render(<TicketCard ticket={base} />)

    expect(screen.getByText('Ana Souza')).toBeInTheDocument()
    expect(screen.getByText('T-AAAA-BBBB-CCCC')).toBeInTheDocument()
    // QR is 148px; card icons are also <svg>, hence the selector.
    expect(container.querySelector('svg[height="148"]')).toBeInTheDocument()
  })

  it('segura o QR enquanto o pagamento não é confirmado', () => {
    const { container } = render(<TicketCard ticket={{ ...base, status: 'pending' }} />)

    expect(container.querySelector('svg[height="148"]')).toBeNull()
    expect(screen.getByText(/QR liberado após a confirmação/i)).toBeInTheDocument()
  })

  it('avisa que o ingresso já entrou, com a hora — é o print reutilizado', () => {
    render(
      <TicketCard
        ticket={{ ...base, status: 'used', usedAt: '2026-09-06T17:32:00.000Z' }}
      />
    )

    expect(screen.getByText(/Já utilizado/i)).toBeInTheDocument()
  })
})
