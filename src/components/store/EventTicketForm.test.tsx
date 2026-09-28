import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const { createReservationMock, toastMock, polling } = vi.hoisted(() => ({
  createReservationMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  polling: {
    active: false,
    onUpdate: null as null | ((r: { status: string; tickets: unknown[] }) => void),
  },
}))

vi.mock('../../lib/event-tickets', () => ({
  createReservation: createReservationMock,
  resendPaymentLink: vi.fn(),
  reservationPixCopy: () => 'A confirmação é automática.',
}))
vi.mock('sonner', () => ({ toast: toastMock }))
// The hook polls on a 6 s timer; the tests drive the update by hand.
vi.mock('../../hooks/useReservationPolling', () => ({
  useReservationPolling: (
    _code: string | null | undefined,
    active: boolean,
    onUpdate: (r: { status: string; tickets: unknown[] }) => void
  ) => {
    polling.active = active
    polling.onUpdate = onUpdate
  },
}))

import { EventTicketForm } from './EventTicketForm'

const openMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('open', openMock)
  polling.active = false
  polling.onUpdate = null
})

async function fillBuyer(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Nome de quem está reservando/i), 'Ana Souza')
  await user.type(screen.getByLabelText(/Telefone/i), '21999999999')
  await user.type(screen.getByLabelText(/E-mail/i), 'ana@example.com')
  await user.type(screen.getByLabelText(/CPF de quem paga/i), '52998224725')
}

const PAGARME_PIX = {
  emvCode: '00020126PAGARME',
  pixKey: '',
  merchantName: 'GEEKPOP E TOYS',
  amount: 20,
  txId: 'ch_1',
  provider: 'pagarme' as const,
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

    // One name field per person: that name is what makes the ticket nominal.
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
    await user.click(screen.getByRole('button', { name: /Reservar e pagar com PIX/i }))

    await waitFor(() => expect(createReservationMock).toHaveBeenCalled())
    expect(createReservationMock.mock.calls[0]![1].buyerDocument).toBe('52998224725')
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
    createReservationMock.mockResolvedValue({ ok: false, error: 'API fora do ar.', retryable: true })
    const user = userEvent.setup()
    renderForm()

    await fillBuyer(user)
    await user.click(screen.getByRole('button', { name: /Reservar e pagar com PIX/i }))

    await waitFor(() => expect(openMock).toHaveBeenCalled())
    expect(toastMock.warning).toHaveBeenCalledWith(expect.stringContaining('API fora do ar.'))
    expect(screen.queryByText(/Reserva registrada/i)).not.toBeInTheDocument()
  })

  it('soma o total pelo tipo de cada ingresso', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('button', { name: /Adicionar pessoa/i }))
    await user.selectOptions(screen.getByLabelText('Tipo de ingresso da pessoa 2'), 'member')

    // R$ 20 (full) + R$ 10 (club member).
    expect(screen.getByText('R$ 30,00')).toBeInTheDocument()
  })

  it('recusa CPF inválido antes de chamar a API', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText(/Nome de quem está reservando/i), 'Ana Souza')
    await user.type(screen.getByLabelText(/Telefone/i), '21999999999')
    await user.type(screen.getByLabelText(/E-mail/i), 'ana@example.com')
    await user.type(screen.getByLabelText(/CPF de quem paga/i), '11111111111')
    await user.click(screen.getByRole('button', { name: /Reservar e pagar com PIX/i }))

    expect(createReservationMock).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/CPF válido/))
  })

  it('recusa do servidor mostra o erro e não abre o WhatsApp', async () => {
    createReservationMock.mockResolvedValue({
      ok: false,
      error: 'Informe um CPF válido para pagar com PIX.',
      retryable: false,
    })
    const user = userEvent.setup()
    renderForm()

    await fillBuyer(user)
    await user.click(screen.getByRole('button', { name: /Reservar e pagar com PIX/i }))

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('Informe um CPF válido para pagar com PIX.')
    )
    expect(openMock).not.toHaveBeenCalled()
  })

  it('reserva só de isentos não pede CPF', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.selectOptions(screen.getByLabelText('Tipo de ingresso da pessoa 1'), 'free')

    expect(screen.queryByLabelText(/CPF de quem paga/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reservar ingresso' })).toBeInTheDocument()
  })

  /**
   * The point of the Pagar.me migration: the buyer pays and the tickets come
   * out on this same screen, with nobody at the shop clicking anything.
   */
  it('mostra o PIX, espera o pagamento e libera os ingressos sozinho', async () => {
    createReservationMock.mockResolvedValue({
      ok: true,
      reservation: { code: 'R-AAAA-BBBB', totalCents: 2000, pix: PAGARME_PIX },
      ticketsUrl: 'https://loja/ingressos/R-AAAA-BBBB',
    })
    const user = userEvent.setup()
    renderForm()

    await fillBuyer(user)
    await user.click(screen.getByRole('button', { name: /Reservar e pagar com PIX/i }))

    expect(await screen.findByText(/esta tela atualiza sozinha/i)).toBeInTheDocument()
    expect(polling.active).toBe(true)
    // With a PIX in hand, WhatsApp is not the payment path.
    expect(openMock).not.toHaveBeenCalled()

    act(() => polling.onUpdate!({ status: 'confirmed', tickets: [] }))

    expect(await screen.findByText('Pagamento confirmado!')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Abrir meus ingressos/i })).toHaveAttribute(
      'href',
      '/ingressos/R-AAAA-BBBB'
    )
    expect(toastMock.success).toHaveBeenCalledWith(
      'Pagamento confirmado! Seus ingressos foram liberados.'
    )
  })

  it('não espera confirmação automática de PIX manual', async () => {
    createReservationMock.mockResolvedValue({
      ok: true,
      reservation: {
        code: 'R-AAAA-BBBB',
        totalCents: 2000,
        pix: { ...PAGARME_PIX, pixKey: 'geekpopee@gmail.com', provider: 'local' },
      },
      ticketsUrl: 'https://loja/ingressos/R-AAAA-BBBB',
    })
    const user = userEvent.setup()
    renderForm()

    await fillBuyer(user)
    await user.click(screen.getByRole('button', { name: /Reservar e pagar com PIX/i }))

    expect(await screen.findByText('Reserva registrada!')).toBeInTheDocument()
    expect(polling.active).toBe(false)
  })
})
