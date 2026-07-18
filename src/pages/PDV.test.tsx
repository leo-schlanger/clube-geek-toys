import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ---------------------------------------------------------------------------
// Mocks — declared before importing the component
// ---------------------------------------------------------------------------

const mockSignOut = vi.fn()
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', uid: 'u1', email: 'seller@test.com' },
    signOut: mockSignOut,
  }),
}))

vi.mock('../lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
}))

const mockGetMemberByCPF = vi.fn()
const mockIsMemberActive = vi.fn()
vi.mock('../lib/members', () => ({
  getMemberByCPF: (...args: unknown[]) => mockGetMemberByCPF(...args),
  isMemberActive: (...args: unknown[]) => mockIsMemberActive(...args),
}))

vi.mock('../lib/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/utils')>()
  return {
    ...actual,
    formatCPF: (cpf: string) => cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'),
    getStatusLabel: (s: string) => s === 'active' ? 'Ativo' : 'Inativo',
  }
})

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  }),
}))

vi.mock('lucide-react', () => {
  const icon = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <span {...props}>{children}</span>
  return {
    Camera: icon,
    Search: icon,
    CheckCircle: icon,
    XCircle: icon,
    AlertTriangle: icon,
    User: icon,
    RefreshCw: icon,
    LogOut: icon,
    Percent: icon,
  }
})

vi.mock('../components/ui/loading', () => ({
  Loading: ({ text }: { text?: string }) => <div data-testid="loading">{text || 'Loading...'}</div>,
}))

vi.mock('../components/QRScanner', () => ({
  QRScanner: ({ onScan, onClose }: { onScan: (d: string) => void; onClose: () => void }) => (
    <div data-testid="qr-scanner">
      <button data-testid="qr-scan-trigger" onClick={() => onScan('{"cpf":"12345678901"}')}>Scan</button>
      <button data-testid="qr-close" onClick={onClose}>Close</button>
    </div>
  ),
}))

// Import after all mocks
import PDV from './PDV'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const activeMember = {
  id: 'm1',
  userId: 'u1',
  fullName: 'Member Test',
  email: 'member@test.com',
  cpf: '12345678901',
  phone: '11999999999',
  plan: 'club' as const,
  status: 'active' as const,
  paymentType: 'annual' as const,
  startDate: '2026-01-01',
  expiryDate: '2027-01-01',
  paymentCount: 3,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PDV', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetMemberByCPF.mockResolvedValue(activeMember)
    mockIsMemberActive.mockReturnValue(true)
  })

  // ─── Header ────────────────────────────────────────────────

  it('renders the PDV header', () => {
    render(<PDV />)
    expect(screen.getByText('PDV - Clube GeekPop & Toys')).toBeInTheDocument()
    expect(screen.getByText('Verificação de membros')).toBeInTheDocument()
  })

  // ─── Mode Toggle ──────────────────────────────────────────

  it('renders mode toggle buttons', () => {
    render(<PDV />)
    expect(screen.getByText('Buscar CPF')).toBeInTheDocument()
    expect(screen.getByText('Scanner QR')).toBeInTheDocument()
  })

  it('defaults to search mode', () => {
    render(<PDV />)
    expect(screen.getByText('Buscar por CPF')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Digite o CPF...')).toBeInTheDocument()
  })

  it('switches to scanner mode', () => {
    render(<PDV />)
    fireEvent.click(screen.getByText('Scanner QR'))
    expect(screen.getByTestId('qr-scanner')).toBeInTheDocument()
  })

  it('switches back from scanner to search mode', () => {
    render(<PDV />)
    fireEvent.click(screen.getByText('Scanner QR'))
    expect(screen.getByTestId('qr-scanner')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Buscar CPF'))
    expect(screen.queryByTestId('qr-scanner')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('Digite o CPF...')).toBeInTheDocument()
  })

  // ─── CPF Search ───────────────────────────────────────────

  it('searches for member by CPF', async () => {
    render(<PDV />)

    await userEvent.type(screen.getByPlaceholderText('Digite o CPF...'), '12345678901')
    fireEvent.submit(screen.getByPlaceholderText('Digite o CPF...').closest('form')!)

    await waitFor(() => {
      expect(mockGetMemberByCPF).toHaveBeenCalledWith('12345678901')
    })
  })

  it('shows member info after successful search', async () => {
    render(<PDV />)

    await userEvent.type(screen.getByPlaceholderText('Digite o CPF...'), '12345678901')
    fireEvent.submit(screen.getByPlaceholderText('Digite o CPF...').closest('form')!)

    await waitFor(() => {
      expect(screen.getByText('Member Test')).toBeInTheDocument()
      expect(screen.getByText('Membro ativo - pode aplicar desconto!')).toBeInTheDocument()
    })
  })

  it('shows the 15% product discount for active member', async () => {
    render(<PDV />)

    await userEvent.type(screen.getByPlaceholderText('Digite o CPF...'), '12345678901')
    fireEvent.submit(screen.getByPlaceholderText('Digite o CPF...').closest('form')!)

    await waitFor(() => {
      expect(screen.getByText('15%')).toBeInTheDocument()
      expect(screen.getByText('de desconto em qualquer produto')).toBeInTheDocument()
    })
  })

  it('shows the club plan badge for the member', async () => {
    render(<PDV />)

    await userEvent.type(screen.getByPlaceholderText('Digite o CPF...'), '12345678901')
    fireEvent.submit(screen.getByPlaceholderText('Digite o CPF...').closest('form')!)

    await waitFor(() => {
      expect(screen.getByText(/Clube GeekPop & Toys/)).toBeInTheDocument()
    })
  })

  it('shows not found when CPF does not match', async () => {
    mockGetMemberByCPF.mockResolvedValue(null)
    render(<PDV />)

    await userEvent.type(screen.getByPlaceholderText('Digite o CPF...'), '99999999999')
    fireEvent.submit(screen.getByPlaceholderText('Digite o CPF...').closest('form')!)

    await waitFor(() => {
      expect(screen.getByText('CPF não encontrado no sistema')).toBeInTheDocument()
    })
  })

  it('shows expired message for expired members', async () => {
    mockIsMemberActive.mockReturnValue(false)
    mockGetMemberByCPF.mockResolvedValue({
      ...activeMember,
      status: 'expired',
      expiryDate: '2020-01-01',
    })

    render(<PDV />)

    await userEvent.type(screen.getByPlaceholderText('Digite o CPF...'), '12345678901')
    fireEvent.submit(screen.getByPlaceholderText('Digite o CPF...').closest('form')!)

    await waitFor(() => {
      expect(screen.getByText('Assinatura expirada - desconto não disponível')).toBeInTheDocument()
    })
  })

  it('does not show the discount block for inactive members', async () => {
    mockIsMemberActive.mockReturnValue(false)
    mockGetMemberByCPF.mockResolvedValue({
      ...activeMember,
      status: 'expired',
      expiryDate: '2020-01-01',
    })

    render(<PDV />)

    await userEvent.type(screen.getByPlaceholderText('Digite o CPF...'), '12345678901')
    fireEvent.submit(screen.getByPlaceholderText('Digite o CPF...').closest('form')!)

    await waitFor(() => {
      expect(screen.getByText(/precisa renovar a assinatura/)).toBeInTheDocument()
    })
    expect(screen.queryByText('de desconto em qualquer produto')).not.toBeInTheDocument()
  })

  // ─── Reset ────────────────────────────────────────────────

  it('resets verification with Nova Verificação button', async () => {
    render(<PDV />)

    await userEvent.type(screen.getByPlaceholderText('Digite o CPF...'), '12345678901')
    fireEvent.submit(screen.getByPlaceholderText('Digite o CPF...').closest('form')!)

    await waitFor(() => {
      expect(screen.getByText('Nova Verificação')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Nova Verificação'))

    expect(screen.queryByText('Member Test')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('Digite o CPF...')).toHaveValue('')
  })

  // ─── QR scan ──────────────────────────────────────────────

  it('processes QR code scan result', async () => {
    render(<PDV />)

    fireEvent.click(screen.getByText('Scanner QR'))
    fireEvent.click(screen.getByTestId('qr-scan-trigger'))

    await waitFor(() => {
      expect(mockGetMemberByCPF).toHaveBeenCalledWith('12345678901')
    })
  })
})
