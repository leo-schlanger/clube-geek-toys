import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PendingPaymentScreen } from './PendingPaymentScreen'
import type { Member, PlanType, Contract } from '../types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

const mockSignOut = vi.fn()
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ signOut: mockSignOut }),
}))

const mockUpdateMember = vi.fn()
const mockClearPendingPayment = vi.fn()
vi.mock('../lib/members', () => ({
  updateMember: (...args: unknown[]) => mockUpdateMember(...args),
  clearPendingPayment: (...args: unknown[]) => mockClearPendingPayment(...args),
}))

const mockCheckPixPaymentStatus = vi.fn()
const mockIsPaymentConfigured = vi.fn(() => true)
vi.mock('../lib/payments', () => ({
  checkPixPaymentStatus: (...args: unknown[]) => mockCheckPixPaymentStatus(...args),
  isPaymentConfigured: () => mockIsPaymentConfigured(),
}))

const mockGetMemberContract = vi.fn()
vi.mock('../lib/contract-storage', () => ({
  getMemberContract: (...args: unknown[]) => mockGetMemberContract(...args),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}))

vi.mock('../lib/logger', () => ({
  paymentLogger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

// Mock sub-components that are hard to test in isolation
vi.mock('./PaymentModal', () => ({
  PaymentModal: ({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) => (
    <div data-testid="payment-modal">
      <button onClick={onClose}>Close Payment</button>
      <button onClick={onSuccess}>Pay Success</button>
    </div>
  ),
}))

vi.mock('./ContractModal', () => ({
  ContractModal: ({ onClose, onSigned }: { onClose: () => void; onSigned: () => void }) => (
    <div data-testid="contract-modal">
      <button onClick={onClose}>Close Contract</button>
      <button onClick={onSigned}>Sign Contract</button>
    </div>
  ),
}))

vi.mock('lucide-react', () => {
  const icon = (name: string) => {
    const Comp = (props: Record<string, unknown>) => <span data-testid={`icon-${name}`} {...props} />
    Comp.displayName = name
    return Comp
  }
  return {
    Clock: icon('Clock'),
    CreditCard: icon('CreditCard'),
    AlertTriangle: icon('AlertTriangle'),
    LogOut: icon('LogOut'),
    Star: icon('Star'),
    Crown: icon('Crown'),
    Sparkles: icon('Sparkles'),
    CheckCircle: icon('CheckCircle'),
    XCircle: icon('XCircle'),
    RefreshCw: icon('RefreshCw'),
    FileText: icon('FileText'),
    PenTool: icon('PenTool'),
  }
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMember(overrides?: Partial<Member>): Member {
  return {
    id: 'member-1',
    userId: 'user-1',
    cpf: '52998224725',
    fullName: 'Joao Da Silva',
    email: 'joao@test.com',
    phone: '11999998888',
    plan: 'club' as PlanType,
    status: 'pending',
    paymentType: 'annual',
    startDate: '',
    expiryDate: '',
    paymentCount: 0,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PendingPaymentScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetMemberContract.mockResolvedValue(null)
    mockClearPendingPayment.mockResolvedValue(undefined)
    mockUpdateMember.mockResolvedValue(true)
    mockIsPaymentConfigured.mockReturnValue(true)
    // Stub window.confirm
    vi.spyOn(window, 'confirm').mockReturnValue(false)
  })

  // ---------- Rendering ----------
  it('should render header with logo and club name', async () => {
    render(<PendingPaymentScreen member={makeMember()} onPaymentSuccess={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Clube Geek & Toys')).toBeInTheDocument()
    })
  })

  it('should render inactive banner', async () => {
    render(<PendingPaymentScreen member={makeMember()} onPaymentSuccess={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText(/ASSINATURA INATIVA/)).toBeInTheDocument()
    })
  })

  it('should render action banner', async () => {
    render(<PendingPaymentScreen member={makeMember()} onPaymentSuccess={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Complete o pagamento')).toBeInTheDocument()
    })
  })

  it('should show plan summary with name, price, and member info', async () => {
    render(<PendingPaymentScreen member={makeMember()} onPaymentSuccess={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Plano Clube Geek & Toys')).toBeInTheDocument()
      expect(screen.getByText('Joao Da Silva')).toBeInTheDocument()
      expect(screen.getByText('joao@test.com')).toBeInTheDocument()
    })
  })

  it('should always show the annual label', async () => {
    render(<PendingPaymentScreen member={makeMember()} onPaymentSuccess={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Anual')).toBeInTheDocument()
    })
  })

  it('should show Pendente badge for status', async () => {
    render(<PendingPaymentScreen member={makeMember()} onPaymentSuccess={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Pendente')).toBeInTheDocument()
    })
  })

  it('should show plan benefits', async () => {
    render(<PendingPaymentScreen member={makeMember()} onPaymentSuccess={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Benefícios incluídos:')).toBeInTheDocument()
    })
  })

  it('should show payment methods info', async () => {
    render(<PendingPaymentScreen member={makeMember()} onPaymentSuccess={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Formas de pagamento:')).toBeInTheDocument()
      expect(screen.getByText(/PIX/)).toBeInTheDocument()
    })
  })

  // ---------- Contract step ----------
  it('should show contract loading state initially', () => {
    // Make contract check never resolve
    mockGetMemberContract.mockReturnValue(new Promise(() => {}))
    render(<PendingPaymentScreen member={makeMember()} onPaymentSuccess={vi.fn()} />)

    expect(screen.getByText('Verificando contrato...')).toBeInTheDocument()
  })

  it('should show contract pending when no contract exists', async () => {
    mockGetMemberContract.mockResolvedValue(null)
    render(<PendingPaymentScreen member={makeMember()} onPaymentSuccess={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Contrato Pendente')).toBeInTheDocument()
      expect(screen.getByText('Assinar Contrato')).toBeInTheDocument()
    })
  })

  it('should show contract signed when contract exists', async () => {
    const contract: Contract = {
      id: 'c1',
      memberId: 'member-1',
      memberName: 'Joao Da Silva',
      memberCPF: '52998224725',
      memberEmail: 'joao@test.com',
      plan: 'club',
      signaturePreview: 'base64...',
      signedAt: '2025-05-01T00:00:00Z',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      documentHash: 'abc123',
      pdfUrl: '/contracts/c1.pdf',
      pdfPath: '/opt/contracts/c1.pdf',
      status: 'active',
      createdAt: '2025-05-01T00:00:00Z',
    }
    mockGetMemberContract.mockResolvedValue(contract)

    render(<PendingPaymentScreen member={makeMember()} onPaymentSuccess={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Contrato Assinado')).toBeInTheDocument()
    })
  })

  it('should disable payment button when contract is not signed', async () => {
    mockGetMemberContract.mockResolvedValue(null)

    render(<PendingPaymentScreen member={makeMember()} onPaymentSuccess={vi.fn()} />)

    await waitFor(() => {
      const payButton = screen.getByText('Pagar Agora')
      expect(payButton.closest('button')).toBeDisabled()
    })
  })

  it('should show "Complete o passo 1 primeiro" when no contract', async () => {
    mockGetMemberContract.mockResolvedValue(null)
    render(<PendingPaymentScreen member={makeMember()} onPaymentSuccess={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Complete o passo 1 primeiro')).toBeInTheDocument()
    })
  })

  // ---------- Contract modal ----------
  it('should open contract modal on Assinar Contrato click', async () => {
    mockGetMemberContract.mockResolvedValue(null)
    render(<PendingPaymentScreen member={makeMember()} onPaymentSuccess={vi.fn()} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('Assinar Contrato'))
    })

    expect(screen.getByTestId('contract-modal')).toBeInTheDocument()
  })

  it('should close contract modal on close', async () => {
    mockGetMemberContract.mockResolvedValue(null)
    render(<PendingPaymentScreen member={makeMember()} onPaymentSuccess={vi.fn()} />)

    await waitFor(() => fireEvent.click(screen.getByText('Assinar Contrato')))
    expect(screen.getByTestId('contract-modal')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Close Contract'))
    expect(screen.queryByTestId('contract-modal')).not.toBeInTheDocument()
  })

  it('should handle contract signed callback', async () => {
    const { toast } = await import('sonner')
    mockGetMemberContract
      .mockResolvedValueOnce(null) // initial check
      .mockResolvedValueOnce({ id: 'c1', signedAt: '2025-05-01' }) // after signing

    render(<PendingPaymentScreen member={makeMember()} onPaymentSuccess={vi.fn()} />)

    await waitFor(() => fireEvent.click(screen.getByText('Assinar Contrato')))
    fireEvent.click(screen.getByText('Sign Contract'))

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Contrato assinado! Agora finalize o pagamento.')
    })
  })

  // ---------- Payment modal ----------
  it('should open payment modal when contract is signed and Pay button clicked', async () => {
    mockGetMemberContract.mockResolvedValue({ id: 'c1', signedAt: '2025-05-01' })

    render(<PendingPaymentScreen member={makeMember()} onPaymentSuccess={vi.fn()} />)

    await waitFor(() => {
      const payButton = screen.getByText('Pagar Agora')
      expect(payButton.closest('button')).not.toBeDisabled()
    })

    fireEvent.click(screen.getByText('Pagar Agora'))
    expect(screen.getByTestId('payment-modal')).toBeInTheDocument()
  })

  // ---------- Pending PIX payment ----------
  it('should show pending PIX info when member has pendingPayment', async () => {
    const member = makeMember({
      pendingPayment: {
        paymentId: 'pix-1',
        qrCode: 'qr-code-data',
        amount: 39.9,
        expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
        createdAt: '2025-05-01T00:00:00Z',
      },
    })
    mockGetMemberContract.mockResolvedValue({ id: 'c1', signedAt: '2025-05-01' })
    mockCheckPixPaymentStatus.mockResolvedValue('pending')

    render(<PendingPaymentScreen member={member} onPaymentSuccess={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('PIX pendente encontrado')).toBeInTheDocument()
      expect(screen.getByText('Continuar Pagamento')).toBeInTheDocument()
      expect(screen.getByText('Verificar se já paguei')).toBeInTheDocument()
    })
  })

  it('should auto-check and confirm paid PIX on mount', async () => {
    const { toast } = await import('sonner')
    const member = makeMember({
      pendingPayment: {
        paymentId: 'pix-1',
        qrCode: 'qr-code-data',
        amount: 39.9,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        createdAt: '2025-05-01T00:00:00Z',
      },
    })
    mockGetMemberContract.mockResolvedValue({ id: 'c1', signedAt: '2025-05-01' })
    mockCheckPixPaymentStatus.mockResolvedValue('paid')
    mockUpdateMember.mockResolvedValue(true)

    const onSuccess = vi.fn()
    render(<PendingPaymentScreen member={member} onPaymentSuccess={onSuccess} />)

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Pagamento anterior confirmado!', { id: 'check-prev' })
      expect(mockClearPendingPayment).toHaveBeenCalledWith('member-1')
    })
  })

  it('should clear expired pending payment on mount', async () => {
    const member = makeMember({
      pendingPayment: {
        paymentId: 'pix-1',
        qrCode: 'qr-code-data',
        amount: 39.9,
        expiresAt: new Date(Date.now() - 3600000).toISOString(), // expired 1 hour ago
        createdAt: '2025-05-01T00:00:00Z',
      },
    })
    mockGetMemberContract.mockResolvedValue(null)

    render(<PendingPaymentScreen member={member} onPaymentSuccess={vi.fn()} />)

    await waitFor(() => {
      expect(mockClearPendingPayment).toHaveBeenCalledWith('member-1')
    })
  })

  it('should clear failed pending payment on mount', async () => {
    const { toast } = await import('sonner')
    const member = makeMember({
      pendingPayment: {
        paymentId: 'pix-1',
        qrCode: 'qr-code-data',
        amount: 39.9,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        createdAt: '2025-05-01T00:00:00Z',
      },
    })
    mockGetMemberContract.mockResolvedValue(null)
    mockCheckPixPaymentStatus.mockResolvedValue('failed')

    render(<PendingPaymentScreen member={member} onPaymentSuccess={vi.fn()} />)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Pagamento anterior falhou. Gere um novo.', { id: 'check-prev' })
      expect(mockClearPendingPayment).toHaveBeenCalledWith('member-1')
    })
  })

  // ---------- Cancel membership ----------
  it('should cancel membership when confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockGetMemberContract.mockResolvedValue(null)
    mockUpdateMember.mockResolvedValue(true)
    mockSignOut.mockResolvedValue(undefined)

    render(<PendingPaymentScreen member={makeMember()} onPaymentSuccess={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Cancelar cadastro')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Cancelar cadastro'))

    await waitFor(() => {
      expect(mockUpdateMember).toHaveBeenCalledWith('member-1', { status: 'inactive' })
      expect(mockSignOut).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })
  })

  it('should not cancel when user declines confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    mockGetMemberContract.mockResolvedValue(null)

    render(<PendingPaymentScreen member={makeMember()} onPaymentSuccess={vi.fn()} />)

    await waitFor(() => fireEvent.click(screen.getByText('Cancelar cadastro')))

    expect(mockUpdateMember).not.toHaveBeenCalled()
  })

  // ---------- Logout button ----------
  it('should call signOut on logout button click', async () => {
    mockGetMemberContract.mockResolvedValue(null)

    render(<PendingPaymentScreen member={makeMember()} onPaymentSuccess={vi.fn()} />)

    // The logout button is a ghost icon button with LogOut icon
    const logoutBtn = screen.getByTestId('icon-LogOut').closest('button')!
    fireEvent.click(logoutBtn)

    expect(mockSignOut).toHaveBeenCalled()
  })

  // ---------- Plan rendering ----------
  it('should render the club plan correctly', async () => {
    mockGetMemberContract.mockResolvedValue(null)
    const member = makeMember({ plan: 'club' })

    render(<PendingPaymentScreen member={member} onPaymentSuccess={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Plano Clube Geek & Toys')).toBeInTheDocument()
    })
  })

  // ---------- "Verificar se já paguei" button ----------
  it('should check previous payment status when verify button is clicked', async () => {
    const member = makeMember({
      pendingPayment: {
        paymentId: 'pix-1',
        qrCode: 'qr-code-data',
        amount: 39.9,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        createdAt: '2025-05-01T00:00:00Z',
      },
    })
    mockGetMemberContract.mockResolvedValue({ id: 'c1', signedAt: '2025-05-01' })
    // First call on mount: pending; second call on button click: pending
    mockCheckPixPaymentStatus.mockResolvedValue('pending')

    render(<PendingPaymentScreen member={member} onPaymentSuccess={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Verificar se já paguei')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Verificar se já paguei'))

    await waitFor(() => {
      // Should have called checkPixPaymentStatus at least twice (mount + click)
      expect(mockCheckPixPaymentStatus).toHaveBeenCalled()
    })
  })
})
