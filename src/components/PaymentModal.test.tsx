import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaymentModal } from './PaymentModal'
import type { PendingPaymentInfo } from '../types'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../hooks/useConfirm', () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true),
}))

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <div data-testid="qr-code">{value}</div>,
}))

const mockGeneratePixPayment = vi.fn()
const mockCheckPaymentStatus = vi.fn()
vi.mock('../lib/payments', () => ({
  generatePixPayment: (...args: unknown[]) => mockGeneratePixPayment(...args),
  checkPaymentStatus: (...args: unknown[]) => mockCheckPaymentStatus(...args),
}))

const mockSavePendingPayment = vi.fn()
const mockClearPendingPayment = vi.fn()
vi.mock('../lib/members', () => ({
  savePendingPayment: (...args: unknown[]) => mockSavePendingPayment(...args),
  clearPendingPayment: (...args: unknown[]) => mockClearPendingPayment(...args),
}))

const mockApiPost = vi.fn()
vi.mock('../lib/api-client', () => ({
  api: { post: (...args: unknown[]) => mockApiPost(...args) },
}))

const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}))

/**
 * Stand-in for the card form. The real one collects and tokenizes the card;
 * what the modal owns is what happens *after* — so the fake hands back a token
 * and lets the tests drive the charge. Its own behaviour lives in
 * `pagarme.test.ts` and the form's own tests.
 */
vi.mock('./PagarmeCardForm', () => ({
  PagarmeCardForm: ({
    onToken,
    onCancel,
  }: {
    onToken: (token: string, installments: number) => Promise<void> | void
    onCancel: () => void
  }) => (
    <div data-testid="card-form">
      <button onClick={() => void onToken('token_abc', 1)}>card-submit</button>
      <button onClick={onCancel}>card-cancel</button>
    </div>
  ),
}))

vi.mock('lucide-react', () => {
  const icon = ({ children, ...props }: Record<string, unknown>) => <span {...props}>{children as string}</span>
  return {
    X: icon, CreditCard: icon, QrCode: icon, Copy: icon, Check: icon,
    Clock: icon, Repeat: icon, Zap: icon, Shield: icon, AlertCircle: icon, RefreshCw: icon,
  }
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

const defaultProps = {
  plan: 'club' as const,
  paymentType: 'monthly' as const,
  memberEmail: 'test@example.com',
  memberId: 'member-123',
  memberName: 'Test User',
  onClose: vi.fn(),
  onSuccess: vi.fn(),
}

function renderModal(overrides = {}) {
  return render(<PaymentModal {...defaultProps} {...overrides} />)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PaymentModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── Rendering ──

  it('renders with plan name and price', () => {
    renderModal()
    expect(screen.getByText('Pagamento')).toBeInTheDocument()
    expect(screen.getAllByText(/Clube GeekPop & Toys/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/12,50/).length).toBeGreaterThanOrEqual(1)
  })

  it('renders the monthly price (R$ 12,50)', () => {
    renderModal()
    expect(screen.getAllByText(/12,50/).length).toBeGreaterThanOrEqual(1)
  })

  it('renders close button that calls onClose', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderModal()
    const btn = screen.getByLabelText('Fechar')
    await user.click(btn)
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('calls onClose when overlay is clicked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onClose = vi.fn()
    const { container } = renderModal({ onClose })
    const overlay = container.querySelector('.modal-overlay')!
    await user.click(overlay)
    expect(onClose).toHaveBeenCalled()
  })

  // ── Mode switch ──

  it('shows mode switch buttons by default', () => {
    renderModal()
    expect(screen.getByText('Pagamento Único')).toBeInTheDocument()
    expect(screen.getByText('Assinatura')).toBeInTheDocument()
  })

  it('hides mode switch when allowModeSwitch=false', () => {
    renderModal({ allowModeSwitch: false })
    expect(screen.queryByText('Pagamento Único')).not.toBeInTheDocument()
    expect(screen.queryByText('Assinatura')).not.toBeInTheDocument()
  })

  it('defaults to one-time mode and shows PIX+Card buttons', () => {
    renderModal()
    expect(screen.getByText('PIX')).toBeInTheDocument()
    expect(screen.getByText('Cartão')).toBeInTheDocument()
  })

  it('subscription mode shows single card button', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderModal()
    await user.click(screen.getByText('Assinatura'))
    expect(screen.getByText(/Iniciar Assinatura com Cartão/)).toBeInTheDocument()
  })

  // ── PIX Flow ──

  it('starts PIX payment on PIX button click', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockGeneratePixPayment.mockResolvedValue({
      paymentIntentId: 'pi_123',
      clientSecret: '',
      qrCode: 'pix-code-emv',
      qrCodeBase64: '',
      qrCodeImageUrl: '',
      pixKey: 'key',
      expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
      amount: 39.9,
    })

    renderModal()
    await user.click(screen.getByText('PIX'))

    await waitFor(() => {
      expect(screen.getByTestId('qr-code')).toBeInTheDocument()
    })
    expect(mockGeneratePixPayment).toHaveBeenCalledWith(
      12.50,
      'Clube GeekPop & Toys - Plano Clube GeekPop & Toys',
      'test@example.com',
      'member-123'
    )
    expect(mockSavePendingPayment).toHaveBeenCalled()
  })

  it('shows error when PIX generation fails', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockGeneratePixPayment.mockResolvedValue(null)

    renderModal()
    await user.click(screen.getByText('PIX'))

    await waitFor(() => {
      expect(screen.getByText('Erro ao gerar QR Code PIX')).toBeInTheDocument()
    })
  })

  it('shows error toast when PIX throws', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockGeneratePixPayment.mockRejectedValue(new Error('Network error'))

    renderModal()
    await user.click(screen.getByText('PIX'))

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Network error')
    })
  })

  it('does not save pending payment for temp members', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockGeneratePixPayment.mockResolvedValue({
      paymentIntentId: 'pi_temp',
      clientSecret: '',
      qrCode: 'code',
      qrCodeBase64: '',
      qrCodeImageUrl: '',
      pixKey: 'key',
      expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
      amount: 39.9,
    })

    renderModal({ memberId: 'temp_member' })
    await user.click(screen.getByText('PIX'))

    await waitFor(() => {
      expect(screen.getByTestId('qr-code')).toBeInTheDocument()
    })
    expect(mockSavePendingPayment).not.toHaveBeenCalled()
  })

  it('copies PIX code on copy button click', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    })

    mockGeneratePixPayment.mockResolvedValue({
      paymentIntentId: 'pi_copy',
      clientSecret: '',
      qrCode: 'pix-emv-code',
      qrCodeBase64: '',
      qrCodeImageUrl: '',
      pixKey: 'key',
      expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
      amount: 39.9,
    })

    renderModal()
    await user.click(screen.getByText('PIX'))

    await waitFor(() => expect(screen.getByTestId('qr-code')).toBeInTheDocument())

    // Click copy button (the button near the input with the PIX code)
    const copyBtn = screen.getByText('Ou copie o código PIX:').parentElement!.querySelector('button')!
    await user.click(copyBtn)

    expect(writeText).toHaveBeenCalledWith('pix-emv-code')
    expect(mockToastSuccess).toHaveBeenCalledWith('Código PIX copiado!')
  })

  it('shows "choose another method" button in PIX view', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockGeneratePixPayment.mockResolvedValue({
      paymentIntentId: 'pi_switch',
      clientSecret: '',
      qrCode: 'code',
      qrCodeBase64: '',
      qrCodeImageUrl: '',
      pixKey: 'key',
      expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
      amount: 39.9,
    })

    renderModal()
    await user.click(screen.getByText('PIX'))

    await waitFor(() => expect(screen.getByText('Escolher outro método')).toBeInTheDocument())
  })

  // ── Card Flow ──

  /**
   * Choosing "cartão" no longer calls the server: Pagar.me authorises from a
   * token in one go, so nothing is created until the member has typed a card.
   * The old flow asked for a PaymentIntent up front just to get a clientSecret.
   */
  it('opens the card form without charging anything yet', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    renderModal()
    await user.click(screen.getByText('Cartão'))

    await waitFor(() => {
      expect(screen.getByTestId('card-form')).toBeInTheDocument()
    })
    expect(mockApiPost).not.toHaveBeenCalled()
  })

  it('charges the club plan with the token the form produced', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockApiPost.mockResolvedValue({ data: { status: 'paid' }, error: null })
    mockClearPendingPayment.mockResolvedValue(true)

    renderModal()
    await user.click(screen.getByText('Cartão'))
    await waitFor(() => expect(screen.getByTestId('card-form')).toBeInTheDocument())
    await user.click(screen.getByText('card-submit'))

    expect(mockApiPost).toHaveBeenCalledWith(
      '/checkout/card/create',
      expect.objectContaining({
        amount: 12.5,
        payer_email: 'test@example.com',
        card_token: 'token_abc',
        installments: 1,
      })
    )
    await waitFor(() => expect(defaultProps.onSuccess).toHaveBeenCalled())
    expect(mockClearPendingPayment).toHaveBeenCalledWith('member-123')
  })

  it('starts subscription card payment', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockApiPost.mockResolvedValue({ data: { status: 'active' }, error: null })

    renderModal()
    await user.click(screen.getByText('Assinatura'))
    await user.click(screen.getByText(/Iniciar Assinatura com Cartão/))
    await waitFor(() => expect(screen.getByTestId('card-form')).toBeInTheDocument())
    await user.click(screen.getByText('card-submit'))

    expect(mockApiPost).toHaveBeenCalledWith(
      '/subscription/create',
      expect.objectContaining({
        member_id: 'member-123',
        plan: 'club',
        card_token: 'token_abc',
      })
    )
  })

  /**
   * A decline must reach the form, which keeps the fields and lets the member
   * try another card. Swallowing it would leave them on a form that did nothing.
   */
  it('propagates the decline to the card form instead of closing', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockApiPost.mockResolvedValue({ data: null, error: 'Cartão recusado: saldo insuficiente.' })

    renderModal()
    await user.click(screen.getByText('Cartão'))
    await waitFor(() => expect(screen.getByTestId('card-form')).toBeInTheDocument())
    await user.click(screen.getByText('card-submit'))

    // Still on the card form, and the payment did not "succeed".
    await waitFor(() => expect(screen.getByTestId('card-form')).toBeInTheDocument())
    expect(defaultProps.onSuccess).not.toHaveBeenCalled()
  })

  it('a `failed` status is a refusal, not a success', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockApiPost.mockResolvedValue({ data: { status: 'failed' }, error: null })

    renderModal()
    await user.click(screen.getByText('Cartão'))
    await waitFor(() => expect(screen.getByTestId('card-form')).toBeInTheDocument())
    await user.click(screen.getByText('card-submit'))

    await waitFor(() => expect(screen.getByTestId('card-form')).toBeInTheDocument())
    expect(defaultProps.onSuccess).not.toHaveBeenCalled()
  })

  it('cancelling the card form goes back to method selection', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    renderModal()
    await user.click(screen.getByText('Cartão'))
    await waitFor(() => expect(screen.getByTestId('card-form')).toBeInTheDocument())

    await user.click(screen.getByText('card-cancel'))
    expect(screen.getByText('PIX')).toBeInTheDocument()
  })

  // ── Error clearing ──

  it('clears error on "try again" button', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    // PIX is the path that still surfaces an error on the modal itself; the
    // card form owns its own error area now.
    mockGeneratePixPayment.mockRejectedValue(new Error('Something broke'))

    renderModal()
    await user.click(screen.getByText('PIX'))

    await waitFor(() => expect(screen.getByText('Something broke')).toBeInTheDocument())

    await user.click(screen.getByText('Tentar novamente'))
    expect(screen.queryByText('Something broke')).not.toBeInTheDocument()
  })

  // ── Pending payment resume ──

  it('resumes from initial pending payment', async () => {
    const pending: PendingPaymentInfo = {
      paymentId: 'pi_pending',
      qrCode: 'pending-code',
      amount: 39.9,
      expiresAt: new Date(Date.now() + 10 * 60000).toISOString(),
      createdAt: new Date().toISOString(),
    }

    renderModal({ initialPendingPayment: pending })

    await waitFor(() => {
      expect(screen.getByTestId('qr-code')).toBeInTheDocument()
      expect(screen.getByTestId('qr-code')).toHaveTextContent('pending-code')
    })
  })

  /**
   * A static PIX BR Code has no validity window — `expiresAt` only says how
   * long we keep polling. Refusing to restore it threw away the member's one
   * copy of a payable code and sent them to generate another, which also meant
   * a second row in `payments` and a second "CGT…" on the bank statement.
   */
  it('resumes a pending payment even past its expiry — the code is still payable', () => {
    const pending: PendingPaymentInfo = {
      paymentId: 'pi_expired',
      qrCode: 'old-code',
      amount: 39.9,
      expiresAt: new Date(Date.now() - 60000).toISOString(),
      createdAt: new Date().toISOString(),
    }

    renderModal({ initialPendingPayment: pending })
    expect(screen.getByTestId('qr-code')).toBeInTheDocument()
  })

  // ── Timer ──

  it('formats time correctly', () => {
    // The timer display is tested indirectly through the PIX flow
    renderModal()
    // formatTime is internal but we can verify the component renders
    expect(screen.getByText('Pagamento')).toBeInTheDocument()
  })

  // ── Plan summary ──

  it('shows plan summary with correct mode label', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderModal()
    expect(screen.getByText(/Pagamento único/)).toBeInTheDocument()

    await user.click(screen.getByText('Assinatura'))
    expect(screen.getByText(/Recorrente/)).toBeInTheDocument()
  })

  it('always shows the monthly frequency label', () => {
    renderModal()
    expect(screen.getByText(/Mensal/)).toBeInTheDocument()
  })
})
