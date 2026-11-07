import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — declared before importing the component
// ---------------------------------------------------------------------------

const mockSignOut = vi.fn()
const mockSendVerificationEmail = vi.fn()
const mockUseAuth = vi.fn()
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock('../lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
}))

const mockGetMemberByUserId = vi.fn()
vi.mock('../lib/members', () => ({
  getMemberByUserId: (...args: unknown[]) => mockGetMemberByUserId(...args),
  getMyActivity: vi.fn().mockResolvedValue([]),
}))

vi.mock('../lib/contract-storage', () => ({
  getMemberContract: vi.fn().mockResolvedValue(null),
}))

vi.mock('../lib/subscriptions', () => ({
  getActiveSubscriptionByMemberId: vi.fn().mockResolvedValue(null),
}))

vi.mock('../lib/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/utils')>()
  return {
    ...actual,
    calculateDaysUntilExpiry: (d: Date) => Math.ceil((d.getTime() - Date.now()) / 86400000),
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
  const icon = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <span {...props}>{children}</span>
  )
  return {
    LogOut: icon,
    Settings: icon,
    RefreshCw: icon,
    AlertTriangle: icon,
    Mail: icon,
    Moon: icon,
    Sun: icon,
    Monitor: icon,
    UserRound: icon,
    XCircle: icon,
  }
})

// Sub-component stubs
vi.mock('../components/ui/loading', () => ({
  LoadingPage: () => <div data-testid="loading-page">Loading...</div>,
}))

vi.mock('../components/PendingPaymentScreen', () => ({
  PendingPaymentScreen: () => <div data-testid="pending-payment-screen">Pending Payment</div>,
}))

vi.mock('../components/member/MembershipCard', () => ({
  MembershipCard: ({ showMascot, paused, onShowQr, below }: { showMascot?: boolean; paused?: boolean; onShowQr?: () => void; below?: React.ReactNode }) => (
    <div data-testid="membership-card" data-mascot={String(showMascot)} data-paused={String(paused)}>
      {below}
      <button type="button" onClick={onShowQr}>
        Mostrar QR na portaria
      </button>
    </div>
  ),
}))

vi.mock('../components/member/CardQrDialog', () => ({
  CardQrDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="qr-dialog">QR</div> : null),
}))

vi.mock('../components/member/WelcomeCelebration', () => ({
  WelcomeCelebration: () => <div data-testid="welcome-celebration">Welcome</div>,
}))

vi.mock('../components/member/BenefitsSection', () => ({
  BenefitsSection: () => <div data-testid="benefits-section">Benefits</div>,
}))

vi.mock('../components/member/MemberDiscount', () => ({
  MemberDiscount: ({ paused }: { paused?: boolean }) => (
    <div data-testid="member-discount" data-paused={String(paused)}>Discount</div>
  ),
}))

vi.mock('../components/member/MemberEvents', () => ({
  MemberEvents: () => <div data-testid="member-events">Events</div>,
}))

vi.mock('../components/member/MemberOrders', () => ({
  MemberOrders: () => <div data-testid="member-orders">Orders</div>,
}))

vi.mock('../components/member/MemberAccount', () => ({
  MemberAccount: () => <div data-testid="member-account">Account</div>,
}))

// Lazy-loaded modals
vi.mock('../components/RenewModal', () => ({
  RenewModal: () => <div data-testid="renew-modal">Renew Modal</div>,
}))

vi.mock('../components/ProfileEditModal', () => ({
  ProfileEditModal: () => <div data-testid="profile-modal">Profile Modal</div>,
}))

// Import after all mocks
import MemberDashboard from './MemberDashboard'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultAuth() {
  return {
    user: { id: 'u1', email: 'test@test.com', role: 'member', emailVerified: true },
    emailVerified: true,
    signOut: mockSignOut,
    sendVerificationEmail: mockSendVerificationEmail,
  }
}

const activeMember = {
  id: 'm1',
  userId: 'u1',
  fullName: 'Test User',
  email: 'test@test.com',
  cpf: '12345678901',
  phone: '11999999999',
  plan: 'club' as const,
  status: 'active' as const,
  paymentType: 'annual' as const,
  startDate: '2026-01-01',
  expiryDate: '2027-01-01',
  paymentCount: 1,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MemberDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue(defaultAuth())
    mockGetMemberByUserId.mockResolvedValue(activeMember)
  })

  // ─── Loading ────────────────────────────────────────────────

  it('shows loading page initially', () => {
    mockGetMemberByUserId.mockReturnValue(new Promise(() => {}))
    render(<MemberDashboard />)
    expect(screen.getByTestId('loading-page')).toBeInTheDocument()
  })

  // ─── Active member dashboard ───────────────────────────────

  it('greets the member by first name', async () => {
    render(<MemberDashboard />)
    expect(await screen.findByRole('heading', { name: 'Olá, Test' })).toBeInTheDocument()
    expect(screen.getByText(/^Em dia · faltam \d+ dias$/)).toBeInTheDocument()
  })

  it('keeps sign out inside a labelled 44px account menu', async () => {
    // Radix positions the menu with ResizeObserver; setup's mock is not constructible
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
    render(<MemberDashboard />)
    const trigger = await screen.findByRole('button', { name: 'Menu da conta' })
    expect(trigger).toHaveClass('h-11', 'w-11')
    expect(screen.queryByText('Sair')).not.toBeInTheDocument()
    fireEvent.keyDown(trigger, { key: 'Enter' })
    fireEvent.click(await screen.findByText('Sair'))
    expect(mockSignOut).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('renders the membership card section', async () => {
    render(<MemberDashboard />)
    await waitFor(() => {
      expect(screen.getByTestId('membership-card')).toBeInTheDocument()
    })
  })

  it('renders every block of the panel', async () => {
    render(<MemberDashboard />)
    await screen.findByTestId('membership-card')
    for (const id of ['member-discount', 'member-events', 'member-orders', 'benefits-section', 'member-account']) {
      expect(screen.getByTestId(id)).toBeInTheDocument()
    }
  })

  it('opens the full-screen QR from the card', async () => {
    render(<MemberDashboard />)
    fireEvent.click(await screen.findByText('Mostrar QR na portaria'))
    expect(screen.getByTestId('qr-dialog')).toBeInTheDocument()
  })

  it('does not render any points sections', async () => {
    render(<MemberDashboard />)
    await waitFor(() => {
      expect(screen.getByTestId('membership-card')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('points-summary')).not.toBeInTheDocument()
    expect(screen.queryByTestId('points-section')).not.toBeInTheDocument()
  })

  // ─── Email verification banner ─────────────────────────────

  it('shows email verification banner when not verified', async () => {
    mockUseAuth.mockReturnValue({
      ...defaultAuth(),
      emailVerified: false,
    })

    render(<MemberDashboard />)
    await waitFor(() => {
      expect(screen.getByText('Verifique seu email')).toBeInTheDocument()
      expect(screen.getByText('Reenviar')).toBeInTheDocument()
    })
  })

  it('does NOT show email verification banner when verified', async () => {
    render(<MemberDashboard />)
    await waitFor(() => {
      expect(screen.queryByText('Verifique seu email')).not.toBeInTheDocument()
    })
  })

  // ─── No member state ──────────────────────────────────────

  // One Nono per screen: the welcome's heart replaces the card's while it shows.
  it('greets a member activated this week and hides the card Nono meanwhile', async () => {
    mockGetMemberByUserId.mockResolvedValue({ ...activeMember, activatedAt: new Date().toISOString() })
    render(<MemberDashboard />)
    expect(await screen.findByTestId('welcome-celebration')).toBeInTheDocument()
    expect(screen.getByTestId('membership-card')).toHaveAttribute('data-mascot', 'false')
  })

  it('does not greet an old member, and the card keeps its Nono', async () => {
    mockGetMemberByUserId.mockResolvedValue({ ...activeMember, activatedAt: '2026-01-01T12:00:00Z' })
    render(<MemberDashboard />)
    expect(await screen.findByTestId('membership-card')).toHaveAttribute('data-mascot', 'true')
    expect(screen.queryByTestId('welcome-celebration')).not.toBeInTheDocument()
  })

  it('shows Nono waving when there is no membership', async () => {
    mockGetMemberByUserId.mockResolvedValue(null)
    render(<MemberDashboard />)
    expect(await screen.findByAltText(/Nono.*acenando/)).toBeInTheDocument()
  })

  it('shows "Nenhuma assinatura encontrada" when member is null', async () => {
    mockGetMemberByUserId.mockResolvedValue(null)
    render(<MemberDashboard />)
    await waitFor(() => {
      expect(screen.getByText('Nenhuma assinatura encontrada')).toBeInTheDocument()
    })
  })

  it('shows "Assinar agora" button when no member', async () => {
    mockGetMemberByUserId.mockResolvedValue(null)
    render(<MemberDashboard />)
    await waitFor(() => {
      expect(screen.getByText('Assinar agora')).toBeInTheDocument()
    })
  })

  // ─── Pending member ───────────────────────────────────────

  it('shows pending payment screen when status is pending', async () => {
    mockGetMemberByUserId.mockResolvedValue({ ...activeMember, status: 'pending' })
    render(<MemberDashboard />)
    await waitFor(() => {
      expect(screen.getByTestId('pending-payment-screen')).toBeInTheDocument()
    })
  })

  // ─── Error state ──────────────────────────────────────────

  it('shows error state when fetch fails', async () => {
    mockGetMemberByUserId.mockRejectedValue(new Error('Network error'))
    render(<MemberDashboard />)
    await waitFor(() => {
      expect(screen.getByText('Erro ao carregar dados')).toBeInTheDocument()
      expect(screen.getByText('Tentar novamente')).toBeInTheDocument()
    })
  })

  it('shows sign out button on error state', async () => {
    mockGetMemberByUserId.mockRejectedValue(new Error('fail'))
    render(<MemberDashboard />)
    await waitFor(() => {
      expect(screen.getByText('Sair')).toBeInTheDocument()
    })
  })

  // ─── Expiry alert ─────────────────────────────────────────

  it('expired: red notice, card paused (QR off), discount paused', async () => {
    mockGetMemberByUserId.mockResolvedValue({ ...activeMember, expiryDate: '2020-01-01' })
    render(<MemberDashboard />)
    expect(await screen.findByText(/Sua carteirinha venceu em/)).toBeInTheDocument()
    expect(screen.getByText('Sua carteirinha está vencida.')).toBeInTheDocument()
    expect(screen.getByTestId('membership-card')).toHaveAttribute('data-paused', 'true')
    expect(screen.getByTestId('member-discount')).toHaveAttribute('data-paused', 'true')
    expect(screen.getByRole('button', { name: /Renovar/ })).toBeInTheDocument()
  })

  it('an inactive status pauses the card even with a future date', async () => {
    mockGetMemberByUserId.mockResolvedValue({ ...activeMember, status: 'inactive' })
    render(<MemberDashboard />)
    expect(await screen.findByTestId('membership-card')).toHaveAttribute('data-paused', 'true')
  })

  it('within 30 days: amber notice with Renovar, card still active', async () => {
    const soon = new Date(Date.now() + 12 * 86_400_000 - 3_600_000).toISOString()
    mockGetMemberByUserId.mockResolvedValue({ ...activeMember, expiryDate: soon })
    render(<MemberDashboard />)
    expect(await screen.findByText('Sua carteirinha vence em 12 dias')).toBeInTheDocument()
    expect(screen.getByText('Vence em 12 dias')).toBeInTheDocument()
    expect(screen.getByTestId('membership-card')).toHaveAttribute('data-paused', 'false')
  })
})
