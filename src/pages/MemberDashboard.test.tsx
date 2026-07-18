import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

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
  const icon = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <span {...props}>{children}</span>
  return {
    LogOut: icon,
    Settings: icon,
    RefreshCw: icon,
    AlertTriangle: icon,
    Mail: icon,
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
  MembershipCard: () => <div data-testid="membership-card">Membership Card</div>,
}))

vi.mock('../components/member/DiscountStrip', () => ({
  DiscountStrip: () => <div data-testid="discount-strip">Discount Strip</div>,
}))

vi.mock('../components/member/QuickActions', () => ({
  QuickActions: () => <div data-testid="quick-actions">Quick Actions</div>,
}))

vi.mock('../components/member/OnboardingGuide', () => ({
  OnboardingGuide: () => <div data-testid="onboarding-guide">Onboarding Guide</div>,
}))

vi.mock('../components/member/WelcomeCelebration', () => ({
  WelcomeCelebration: () => <div data-testid="welcome-celebration">Welcome</div>,
}))

vi.mock('../components/member/BenefitsSection', () => ({
  BenefitsSection: () => <div data-testid="benefits-section">Benefits</div>,
}))

vi.mock('../components/member/SubscriptionCard', () => ({
  SubscriptionCard: () => <div data-testid="subscription-card">Subscription</div>,
}))

vi.mock('../components/member/AccountSection', () => ({
  AccountSection: () => <div data-testid="account-section">Account Section</div>,
}))

vi.mock('../components/MemberActivityHistory', () => ({
  MemberActivityHistory: () => <div data-testid="activity-history">Activity History</div>,
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

  it('renders header with logo text', async () => {
    render(<MemberDashboard />)
    await waitFor(() => {
      expect(screen.getByText('Clube GeekPop & Toys')).toBeInTheDocument()
    })
  })

  it('renders the membership card section', async () => {
    render(<MemberDashboard />)
    await waitFor(() => {
      expect(screen.getByTestId('membership-card')).toBeInTheDocument()
    })
  })

  it('renders the discount strip section', async () => {
    render(<MemberDashboard />)
    await waitFor(() => {
      expect(screen.getByTestId('discount-strip')).toBeInTheDocument()
    })
  })

  it('renders the quick actions', async () => {
    render(<MemberDashboard />)
    await waitFor(() => {
      expect(screen.getByTestId('quick-actions')).toBeInTheDocument()
    })
  })

  it('renders the benefits section', async () => {
    render(<MemberDashboard />)
    await waitFor(() => {
      expect(screen.getByTestId('benefits-section')).toBeInTheDocument()
    })
  })

  it('renders the subscription card', async () => {
    render(<MemberDashboard />)
    await waitFor(() => {
      expect(screen.getByTestId('subscription-card')).toBeInTheDocument()
    })
  })

  it('renders the account section', async () => {
    render(<MemberDashboard />)
    await waitFor(() => {
      expect(screen.getByTestId('account-section')).toBeInTheDocument()
    })
  })

  it('renders the activity history', async () => {
    render(<MemberDashboard />)
    await waitFor(() => {
      expect(screen.getByTestId('activity-history')).toBeInTheDocument()
    })
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

  it('shows expired alert when membership is expired', async () => {
    mockGetMemberByUserId.mockResolvedValue({
      ...activeMember,
      expiryDate: '2020-01-01',
    })

    render(<MemberDashboard />)
    await waitFor(() => {
      expect(screen.getByText('Sua assinatura expirou!')).toBeInTheDocument()
    })
  })
})
