import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const createCardToken = vi.fn(async (..._args: unknown[]) => 'token_test')
const captureMessage = vi.fn()

vi.mock('../lib/pagarme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/pagarme')>()
  return {
    ...actual,
    createCardToken: (...args: unknown[]) => createCardToken(...args),
    getPaymentConfig: async () => ({
      provider: 'pagarme',
      publicKey: 'pk_test',
      configured: true,
      maxInstallments: 1,
      minInstallmentAmount: 20,
      pixExpiresIn: 3600,
    }),
  }
})

vi.mock('../lib/error-tracking', () => ({
  ErrorTracker: { captureMessage: (...args: unknown[]) => captureMessage(...args) },
}))

import { PagarmeCardForm } from './PagarmeCardForm'

function fillCard(expiry: string) {
  fireEvent.change(screen.getByLabelText('Número do cartão'), {
    target: { value: '4000 0000 0000 0010' },
  })
  fireEvent.change(screen.getByLabelText('Nome impresso no cartão'), {
    target: { value: 'MARIA DA SILVA' },
  })
  fireEvent.change(screen.getByLabelText('CPF do titular'), { target: { value: '52998224725' } })
  fireEvent.change(screen.getByLabelText('Validade'), { target: { value: expiry } })
  fireEvent.change(screen.getByLabelText('Código de segurança'), { target: { value: '123' } })
}

describe('PagarmeCardForm expiry', () => {
  beforeEach(() => {
    createCardToken.mockClear()
    captureMessage.mockClear()
  })

  it.each([
    ['committed at once, without the slash', '1230'],
    ['autofilled with a four-digit year', '12/2030'],
  ])('accepts an expiry %s', async (_label, typed) => {
    const onToken = vi.fn()
    render(<PagarmeCardForm amount={100} onToken={onToken} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /Pagar/ })).toBeEnabled())

    fillCard(typed)
    expect(screen.getByLabelText('Validade')).toHaveValue('12/30')
    fireEvent.click(screen.getByRole('button', { name: /Pagar/ }))

    await waitFor(() => expect(onToken).toHaveBeenCalledWith('token_test', 1))
    expect(createCardToken.mock.calls[0][0]).toMatchObject({ expMonth: '12', expYear: '30' })
    expect(screen.queryByText('Validade inválida ou vencida.')).not.toBeInTheDocument()
  })

  it('reports a submit blocked by local validation, naming fields only', async () => {
    render(<PagarmeCardForm amount={100} onToken={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /Pagar/ })).toBeEnabled())

    fillCard('0120')
    fireEvent.click(screen.getByRole('button', { name: /Pagar/ }))

    expect(await screen.findByText('Validade inválida ou vencida.')).toBeInTheDocument()
    expect(createCardToken).not.toHaveBeenCalled()
    expect(captureMessage).toHaveBeenCalledWith('Card form blocked by local validation', 'warning', {
      fields: ['expiry'],
    })
  })
})
