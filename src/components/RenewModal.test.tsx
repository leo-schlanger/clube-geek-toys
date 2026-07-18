import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RenewModal } from './RenewModal'
import type { Member } from '../types'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockUpdateMember = vi.fn()
vi.mock('../lib/members', () => ({
  updateMember: (...args: unknown[]) => mockUpdateMember(...args),
}))

const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}))

vi.mock('./PaymentModal', () => ({
  PaymentModal: ({
    onSuccess,
    onClose,
  }: {
    onSuccess: () => void
    onClose: () => void
  }) => (
    <div data-testid="payment-modal">
      <button onClick={onSuccess}>payment-success</button>
      <button onClick={onClose}>payment-close</button>
    </div>
  ),
}))

vi.mock('lucide-react', () => {
  const icon = ({ children, ...props }: Record<string, unknown>) => <span {...props}>{children as string}</span>
  return {
    X: icon, Sparkles: icon, Check: icon,
    ArrowRight: icon, RefreshCw: icon,
  }
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: 'member-1',
    userId: 'user-1',
    cpf: '12345678901',
    fullName: 'Test Member',
    email: 'test@example.com',
    phone: '11999999999',
    plan: 'club',
    status: 'active',
    paymentType: 'annual',
    startDate: '2026-01-01',
    expiryDate: '2026-06-01',
    paymentCount: 2,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  }
}

const defaultProps = {
  member: makeMember(),
  onClose: vi.fn(),
  onSuccess: vi.fn(),
}

function renderModal(overrides = {}) {
  return render(<RenewModal {...defaultProps} {...overrides} />)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RenewModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Rendering ──

  it('renders title and plan name', () => {
    renderModal()
    expect(screen.getByText('Renovar Assinatura')).toBeInTheDocument()
    expect(screen.getAllByText(/Clube Geek & Toys/).length).toBeGreaterThanOrEqual(1)
  })

  it('renders plan benefits', () => {
    renderModal()
    expect(screen.getByText(/15% de desconto em qualquer produto/)).toBeInTheDocument()
  })

  it('shows annual price (R$ 149,99)', () => {
    renderModal()
    expect(screen.getAllByText(/149,99/).length).toBeGreaterThanOrEqual(1)
  })

  it('shows total to pay with the annual price', () => {
    renderModal()
    const totalSection = screen.getByText('Total a pagar:').closest('div')!
    expect(totalSection).toHaveTextContent('149,99')
  })

  it('shows renewal period info (1 year)', () => {
    renderModal()
    expect(screen.getByText('Sua assinatura será renovada por 1 ano')).toBeInTheDocument()
  })

  // ── Buttons ──

  it('calls onClose on cancel button', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderModal({ onClose })

    await user.click(screen.getByText('Cancelar'))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose on overlay click', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { container } = renderModal({ onClose })

    const overlay = container.querySelector('.modal-overlay')!
    await user.click(overlay)
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose on X button', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { container } = renderModal({ onClose })

    // X button is the first button inside CardHeader
    const xBtn = container.querySelector('button.absolute')!
    await user.click(xBtn)
    expect(onClose).toHaveBeenCalled()
  })

  // ── Payment flow ──

  it('opens PaymentModal on continue button click', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.click(screen.getByText('Continuar'))

    expect(screen.getByTestId('payment-modal')).toBeInTheDocument()
  })

  it('handles payment success', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    renderModal({ onSuccess })

    await user.click(screen.getByText('Continuar'))
    await user.click(screen.getByText('payment-success'))

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining('Pagamento processado'))
      expect(onSuccess).toHaveBeenCalled()
    })
    // Renovação anual não altera paymentType — não chama updateMember
    expect(mockUpdateMember).not.toHaveBeenCalled()
  })

  it('closes PaymentModal on payment close', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.click(screen.getByText('Continuar'))
    expect(screen.getByTestId('payment-modal')).toBeInTheDocument()

    await user.click(screen.getByText('payment-close'))
    expect(screen.queryByTestId('payment-modal')).not.toBeInTheDocument()
    expect(screen.getByText('Renovar Assinatura')).toBeInTheDocument()
  })
})
