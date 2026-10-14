import { StrictMode } from 'react'
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

describe('PagarmeCardForm exit report', () => {
  beforeEach(async () => {
    // The previous test's form reports its unmount on a deferred timer.
    await new Promise((r) => setTimeout(r, 0))
    createCardToken.mockClear()
    captureMessage.mockClear()
  })

  const exitReports = () =>
    captureMessage.mock.calls.filter((c) => c[0] === 'Card form left without paying')

  async function ready() {
    await waitFor(() => expect(screen.getByRole('button', { name: /Pagar/ })).toBeEnabled())
  }

  it('reports a buyer who leaves the page without pressing Pagar', async () => {
    render(<PagarmeCardForm amount={100} onToken={vi.fn()} logContext={{ orderNumber: 47 }} />)
    await ready()
    fireEvent.change(screen.getByLabelText('Número do cartão'), { target: { value: '4000' } })

    window.dispatchEvent(new Event('pagehide'))

    expect(exitReports()).toHaveLength(1)
    const [, severity, context] = exitReports()[0]
    expect(severity).toBe('warning')
    expect(context).toMatchObject({ reason: 'pagehide', attempts: 0, orderNumber: 47, declined: false })
    // Field names only — never a value.
    expect(context.filled).toEqual(['number'])
    expect(JSON.stringify(context)).not.toContain('4000')
  })

  it('reports once when the form is closed inside the app', async () => {
    const { unmount } = render(<PagarmeCardForm amount={100} onToken={vi.fn()} />)
    await ready()

    unmount()
    await waitFor(() => expect(exitReports()).toHaveLength(1))
    window.dispatchEvent(new Event('pagehide'))
    expect(exitReports()[0][2]).toMatchObject({ reason: 'unmount' })
    expect(exitReports()).toHaveLength(1)
  })

  it('stays quiet once the card was charged', async () => {
    const { unmount } = render(<PagarmeCardForm amount={100} onToken={vi.fn()} />)
    await ready()
    fillCard('12/30')
    fireEvent.click(screen.getByRole('button', { name: /Pagar/ }))
    await waitFor(() => expect(createCardToken).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('button', { name: /Pagar/ })).toBeEnabled())

    unmount()
    window.dispatchEvent(new Event('pagehide'))
    await new Promise((r) => setTimeout(r, 10))
    expect(exitReports()).toHaveLength(0)
  })

  it('says the card was declined when the buyer leaves after a refusal', async () => {
    const onToken = vi.fn(async (..._args: unknown[]) => {
      throw new Error('Cartão recusado')
    })
    render(<PagarmeCardForm amount={100} onToken={onToken} />)
    await ready()
    fillCard('12/30')
    fireEvent.click(screen.getByRole('button', { name: /Pagar/ }))
    expect(await screen.findByText('Cartão recusado')).toBeInTheDocument()

    window.dispatchEvent(new Event('pagehide'))
    expect(exitReports()[0][2]).toMatchObject({ attempts: 1, declined: true })
  })

  it("does not report StrictMode's development remount", async () => {
    render(
      <StrictMode>
        <PagarmeCardForm amount={100} onToken={vi.fn()} />
      </StrictMode>
    )
    await ready()
    await new Promise((r) => setTimeout(r, 10))
    expect(exitReports()).toHaveLength(0)
  })
})
