import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial: _i, animate: _a, transition: _t, exit: _e, ...rest } = props
      return <div {...rest}>{children}</div>
    },
  },
}))

const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
const mockToastLoading = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
    loading: (...args: unknown[]) => mockToastLoading(...args),
  },
}))

vi.mock('lucide-react', () => {
  const icon = ({ children, ...props }: Record<string, unknown>) => (
    <span {...props}>{children as string}</span>
  )
  return {
    CreditCard: icon, QrCode: icon, Copy: icon, Check: icon,
    Clock: icon, Repeat: icon, Zap: icon, Shield: icon,
    AlertCircle: icon, RefreshCw: icon, ArrowLeft: icon, Loader2: icon,
  }
})

const mockGeneratePixPayment = vi.fn()
const mockCheckPaymentStatus = vi.fn()
vi.mock('../../lib/payments', () => ({
  generatePixPayment: (...args: unknown[]) => mockGeneratePixPayment(...args),
  checkPaymentStatus: (...args: unknown[]) => mockCheckPaymentStatus(...args),
}))

const mockSavePendingPayment = vi.fn().mockResolvedValue(undefined)
const mockClearPendingPayment = vi.fn().mockResolvedValue(undefined)
vi.mock('../../lib/members', () => ({
  savePendingPayment: (...args: unknown[]) => mockSavePendingPayment(...args),
  clearPendingPayment: (...args: unknown[]) => mockClearPendingPayment(...args),
}))

const mockApiPost = vi.fn()
vi.mock('../../lib/api-client', () => ({
  api: {
    post: (...args: unknown[]) => mockApiPost(...args),
  },
}))

vi.mock('../../lib/utils', () => ({
  formatCurrency: (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => (
    <div data-testid="qrcode-svg">{value}</div>
  ),
}))

vi.mock('../StripePaymentForm', () => ({
  StripePaymentForm: ({
    onSuccess,
    onCancel,
  }: {
    clientSecret: string
    onSuccess: () => void
    onError: (msg: string) => void
    onCancel: () => void
    amount: number
    submitLabel?: string
  }) => (
    <div data-testid="stripe-form">
      <button data-testid="stripe-pay" onClick={onSuccess}>
        Pay
      </button>
      <button data-testid="stripe-cancel" onClick={onCancel}>
        Cancel
      </button>
    </div>
  ),
}))

import { StepPayment } from './StepPayment'

// ─── Helpers ────────────────────────────────────────────────────────────────

const defaultProps = {
  plan: 'club' as const,
  paymentType: 'annual' as const,
  memberId: 'member-123',
  memberEmail: 'test@example.com',
  memberName: 'Test User',
  onSuccess: vi.fn(),
  onBack: vi.fn(),
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('StepPayment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── Rendering ──────────────────────────────────────────────────────────

  it('renders order summary with plan name and price', () => {
    vi.useRealTimers()
    render(<StepPayment {...defaultProps} />)

    expect(screen.getAllByText('Clube GeekPop & Toys').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/assinatura anual/i)).toBeInTheDocument()
    expect(screen.getByText(/149,99/)).toBeInTheDocument()
    expect(screen.getByText(/pagamento seguro via stripe/i)).toBeInTheDocument()
  })

  it('renders payment mode toggle buttons', () => {
    vi.useRealTimers()
    render(<StepPayment {...defaultProps} />)

    expect(screen.getByText(/pagamento unico/i)).toBeInTheDocument()
    expect(screen.getByText(/cobranca recorrente/i)).toBeInTheDocument()
  })

  it('renders PIX and card method selection in one-time mode', () => {
    vi.useRealTimers()
    render(<StepPayment {...defaultProps} />)

    expect(screen.getByRole('button', { name: /pix.*qr code/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^cartao.*credito$/i })).toBeInTheDocument()
  })

  it('renders back button', () => {
    vi.useRealTimers()
    render(<StepPayment {...defaultProps} />)

    expect(screen.getByRole('button', { name: /voltar/i })).toBeInTheDocument()
  })

  it('calls onBack when back button is clicked', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    render(<StepPayment {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: /voltar/i }))
    expect(defaultProps.onBack).toHaveBeenCalledTimes(1)
  })

  // ── Subscription mode ─────────────────────────────────────────────────

  it('shows card-only button in subscription mode', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    render(<StepPayment {...defaultProps} />)

    await user.click(screen.getByText(/cobranca recorrente/i))

    expect(screen.getByRole('button', { name: /iniciar assinatura com cartao/i })).toBeInTheDocument()
    // PIX method button should not be visible (only the mode toggle remains)
    expect(screen.queryByRole('button', { name: /pix.*qr code/i })).not.toBeInTheDocument()
  })

  // ── PIX flow ──────────────────────────────────────────────────────────

  it('generates PIX payment and shows QR code', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    mockGeneratePixPayment.mockResolvedValue({
      paymentIntentId: 'pi_test123',
      clientSecret: 'cs_test',
      qrCode: '00020126580014BR.GOV.BCB.PIX...',
      qrCodeBase64: 'base64data',
      qrCodeImageUrl: '',
      amount: 39.9,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })

    render(<StepPayment {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: /pix.*qr code/i }))

    await waitFor(() => {
      expect(screen.getByTestId('qrcode-svg')).toBeInTheDocument()
    })

    expect(mockSavePendingPayment).toHaveBeenCalled()
  })

  it('shows error when PIX generation fails', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    mockGeneratePixPayment.mockResolvedValue(null)

    render(<StepPayment {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: /pix.*qr code/i }))

    await waitFor(() => {
      expect(screen.getByText(/erro ao gerar qr code pix/i)).toBeInTheDocument()
    })
  })

  it('shows error when PIX generation throws', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    mockGeneratePixPayment.mockRejectedValue(new Error('Network error'))

    render(<StepPayment {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: /pix.*qr code/i }))

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Network error')
    })
  })

  // ── Card flow ─────────────────────────────────────────────────────────

  it('initializes card payment and shows Stripe form', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    mockApiPost.mockResolvedValue({
      data: { clientSecret: 'cs_test_secret', paymentIntentId: 'pi_test' },
      error: null,
    })

    render(<StepPayment {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: /^cartao.*credito$/i }))

    await waitFor(() => {
      expect(screen.getByTestId('stripe-form')).toBeInTheDocument()
    })
  })

  it('shows error when card payment initialization fails', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    mockApiPost.mockResolvedValue({ data: null, error: 'Server error' })

    render(<StepPayment {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: /^cartao.*credito$/i }))

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled()
    })
  })

  it('calls onSuccess on successful card payment', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    mockApiPost.mockResolvedValue({
      data: { clientSecret: 'cs_test_secret', paymentIntentId: 'pi_test' },
      error: null,
    })

    render(<StepPayment {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: /^cartao.*credito$/i }))

    await waitFor(() => {
      expect(screen.getByTestId('stripe-pay')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('stripe-pay'))
    expect(defaultProps.onSuccess).toHaveBeenCalledTimes(1)
  })

  it('resets method when cancel is clicked on Stripe form', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    mockApiPost.mockResolvedValue({
      data: { clientSecret: 'cs_test_secret' },
      error: null,
    })

    render(<StepPayment {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: /^cartao.*credito$/i }))

    await waitFor(() => {
      expect(screen.getByTestId('stripe-cancel')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('stripe-cancel'))

    // Should go back to method selection
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /pix.*qr code/i })).toBeInTheDocument()
    })
  })

  // ── Error display ─────────────────────────────────────────────────────

  it('shows retry button on error and clears on click', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    mockGeneratePixPayment.mockResolvedValue(null)

    render(<StepPayment {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: /pix.*qr code/i }))

    await waitFor(() => {
      expect(screen.getByText(/erro ao gerar qr code pix/i)).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /tentar novamente/i }))

    // Error should be cleared, method selection should be back
    expect(screen.queryByText(/erro ao gerar qr code pix/i)).not.toBeInTheDocument()
  })
})
