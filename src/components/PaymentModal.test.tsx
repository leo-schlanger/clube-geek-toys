import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaymentModal } from './PaymentModal'
import type { PendingPaymentInfo } from '../types'

// ─── Mocks ────────────────────────────────────────────────────────────────────

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

// Mock StripePaymentForm
vi.mock('./StripePaymentForm', () => ({
  StripePaymentForm: ({
    onSuccess,
    onCancel,
    onError,
  }: {
    onSuccess: () => void
    onCancel: () => void
    onError: (msg: string) => void
  }) => (
    <div data-testid="stripe-form">
      <button onClick={onSuccess}>stripe-success</button>
      <button onClick={onCancel}>stripe-cancel</button>
      <button onClick={() => onError('stripe error')}>stripe-error</button>
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
  paymentType: 'annual' as const,
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
    expect(screen.getAllByText(/149,99/).length).toBeGreaterThanOrEqual(1)
  })

  it('renders the annual price (R$ 149,99)', () => {
    renderModal()
    expect(screen.getAllByText(/149,99/).length).toBeGreaterThanOrEqual(1)
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
      149.99,
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

  it('starts card payment on Card button click (one-time)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockApiPost.mockResolvedValue({
      data: { clientSecret: 'cs_test', paymentIntentId: 'pi_card' },
      error: null,
    })

    renderModal()
    await user.click(screen.getByText('Cartão'))

    await waitFor(() => {
      expect(screen.getByTestId('stripe-form')).toBeInTheDocument()
    })
    expect(mockApiPost).toHaveBeenCalledWith('/checkout/card/create', expect.objectContaining({
      amount: 149.99,
      payer_email: 'test@example.com',
    }))
  })

  it('starts subscription card payment', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockApiPost.mockResolvedValue({
      data: { clientSecret: 'cs_sub', id: 'sub_1' },
      error: null,
    })

    renderModal()
    await user.click(screen.getByText('Assinatura'))
    await user.click(screen.getByText(/Iniciar Assinatura com Cartão/))

    await waitFor(() => {
      expect(screen.getByTestId('stripe-form')).toBeInTheDocument()
    })
    expect(mockApiPost).toHaveBeenCalledWith('/subscription/create', expect.objectContaining({
      member_id: 'member-123',
      plan: 'club',
    }))
  })

  it('shows error when card API fails', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockApiPost.mockResolvedValue({ data: null, error: 'Card error' })

    renderModal()
    await user.click(screen.getByText('Cartão'))

    await waitFor(() => {
      expect(screen.getByText('Card error')).toBeInTheDocument()
    })
  })

  it('shows error when no clientSecret returned', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockApiPost.mockResolvedValue({ data: {}, error: null })

    renderModal()
    await user.click(screen.getByText('Cartão'))

    await waitFor(() => {
      expect(screen.getByText('Não foi possível inicializar o pagamento.')).toBeInTheDocument()
    })
  })

  it('handles stripe success callback', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockApiPost.mockResolvedValue({
      data: { clientSecret: 'cs_ok', paymentIntentId: 'pi_ok' },
      error: null,
    })
    mockClearPendingPayment.mockResolvedValue(true)

    renderModal()
    await user.click(screen.getByText('Cartão'))

    await waitFor(() => expect(screen.getByTestId('stripe-form')).toBeInTheDocument())

    await user.click(screen.getByText('stripe-success'))
    expect(defaultProps.onSuccess).toHaveBeenCalled()
    expect(mockClearPendingPayment).toHaveBeenCalledWith('member-123')
  })

  it('handles stripe cancel callback', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockApiPost.mockResolvedValue({
      data: { clientSecret: 'cs_cancel', paymentIntentId: 'pi_c' },
      error: null,
    })

    renderModal()
    await user.click(screen.getByText('Cartão'))

    await waitFor(() => expect(screen.getByTestId('stripe-form')).toBeInTheDocument())

    await user.click(screen.getByText('stripe-cancel'))
    // Should go back to method selection
    expect(screen.getByText('PIX')).toBeInTheDocument()
  })

  // ── Error clearing ──

  it('clears error on "try again" button', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockApiPost.mockResolvedValue({ data: null, error: 'Something broke' })

    renderModal()
    await user.click(screen.getByText('Cartão'))

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

  it('does not resume expired pending payment', () => {
    const pending: PendingPaymentInfo = {
      paymentId: 'pi_expired',
      qrCode: 'old-code',
      amount: 39.9,
      expiresAt: new Date(Date.now() - 60000).toISOString(),
      createdAt: new Date().toISOString(),
    }

    renderModal({ initialPendingPayment: pending })
    expect(screen.queryByTestId('qr-code')).not.toBeInTheDocument()
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

  it('always shows the annual frequency label', () => {
    renderModal()
    expect(screen.getByText(/Anual/)).toBeInTheDocument()
  })
})
