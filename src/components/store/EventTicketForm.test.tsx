import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const { createReservationMock, toastMock } = vi.hoisted(() => ({
  createReservationMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

vi.mock('../../lib/event-tickets', () => ({ createReservation: createReservationMock }))
vi.mock('sonner', () => ({ toast: toastMock }))

import { EventTicketForm } from './EventTicketForm'

const openMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('open', openMock)
})

async function fillBuyer(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Nome de quem está reservando/i), 'Ana Souza')
  await user.type(screen.getByLabelText(/Telefone/i), '21999999999')
  await user.type(screen.getByLabelText(/E-mail/i), 'ana@example.com')
}

function renderForm() {
  return render(
    <MemoryRouter>
      <EventTicketForm />
    </MemoryRouter>
  )
}

describe('EventTicketForm', () => {
  it('não impõe teto de quantidade — a família pede quantos quiser', async () => {
    const user = userEvent.setup()
    renderForm()

    const qty = screen.getByLabelText(/Quantas pessoas/i)
    expect(qty).not.toHaveAttribute('max')

    await user.clear(qty)
    await user.type(qty, '9')

    // Uma linha de nome por pessoa: é o nome que torna o ingresso nominal.
    expect(screen.getByLabelText('Nome da pessoa 9')).toBeInTheDocument()
  })

  it('envia um ingresso por pessoa e mostra o código da reserva', async () => {
    createReservationMock.mockResolvedValue({
      ok: true,
      reservation: { code: 'R-AAAA-BBBB' },
      ticketsUrl: 'https://loja/ingressos/R-AAAA-BBBB',
    })
    const user = userEvent.setup()
    renderForm()

    await fillBuyer(user)
    await user.click(screen.getByRole('button', { name: /Adicionar pessoa/i }))
    await user.type(screen.getByLabelText('Nome da pessoa 2'), 'Bia Souza')
    await user.selectOptions(screen.getByLabelText('Tipo de ingresso da pessoa 2'), 'free')
    await user.click(screen.getByRole('button', { name: /Reservar e enviar no WhatsApp/i }))

    await waitFor(() => expect(createReservationMock).toHaveBeenCalled())
    expect(createReservationMock.mock.calls[0]![1].attendees).toEqual([
      { name: 'Ana Souza', kind: 'full' },
      { name: 'Bia Souza', kind: 'free' },
    ])
    expect(await screen.findByText(/R-AAAA-BBBB/)).toBeInTheDocument()
    expect(openMock).toHaveBeenCalledWith(
      expect.stringContaining('https://wa.me/'),
      '_blank',
      'noopener,noreferrer'
    )
  })

  it('cai no WhatsApp quando a API falha — a venda não morre no formulário', async () => {
    createReservationMock.mockResolvedValue({ ok: false, error: 'API fora do ar.' })
    const user = userEvent.setup()
    renderForm()

    await fillBuyer(user)
    await user.click(screen.getByRole('button', { name: /Reservar e enviar no WhatsApp/i }))

    await waitFor(() => expect(openMock).toHaveBeenCalled())
    expect(toastMock.warning).toHaveBeenCalledWith(expect.stringContaining('API fora do ar.'))
    expect(screen.queryByText(/Reserva registrada/i)).not.toBeInTheDocument()
  })

  it('soma o total pelo tipo de cada ingresso', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('button', { name: /Adicionar pessoa/i }))
    await user.selectOptions(screen.getByLabelText('Tipo de ingresso da pessoa 2'), 'member')

    // R$ 20 (inteira) + R$ 10 (membro do Clube).
    expect(screen.getByText('R$ 30,00')).toBeInTheDocument()
  })
})
