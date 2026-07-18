/**
 * App Component Tests
 *
 * Covers: rendering without crash, providers present, route structure,
 * member vs admin mode routing, protected routes, role-based access.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

// ── Mutable auth state for per-test overrides ────────────────

const mockAuthState = {
  user: null as { uid: string; email: string } | null,
  role: null as string | null,
  loading: false,
  emailVerified: false,
  signOut: vi.fn(),
  signIn: vi.fn(),
  authReady: true,
  refreshAuth: vi.fn(),
}

// ── Mocks ──────────────────────────────────────────────────────

// Mock subdomain module to control app mode
vi.mock('./lib/subdomain', () => ({
  getAppMode: () => 'member',
}))

// Mock AuthContext — useAuth reads from mutable mockAuthState
vi.mock('./contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => mockAuthState,
}))

// Mock useConfirm
vi.mock('./hooks/useConfirm', () => ({
  ConfirmProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useConfirm: () => vi.fn().mockResolvedValue(true),
}))

// Mock lazy-loaded pages
vi.mock('./pages/Login', () => ({ default: () => <div data-testid="login-page">Login</div> }))
vi.mock('./pages/ForgotPassword', () => ({ default: () => <div data-testid="forgot-password-page">ForgotPassword</div> }))
vi.mock('./pages/Subscribe', () => ({ default: () => <div data-testid="subscribe-page">Subscribe</div> }))
vi.mock('./pages/Register', () => ({ default: () => <div data-testid="register-page">Register</div> }))
vi.mock('./pages/VerifyEmail', () => ({ default: () => <div data-testid="verify-email-page">VerifyEmail</div> }))
vi.mock('./pages/MemberDashboard', () => ({ default: () => <div data-testid="member-dashboard">MemberDashboard</div> }))
vi.mock('./pages/PaymentResult', () => ({ default: ({ type }: { type: string }) => <div>PaymentResult-{type}</div> }))
vi.mock('./pages/TermsOfUse', () => ({ default: () => <div data-testid="terms-page">TermsOfUse</div> }))
vi.mock('./pages/PrivacyPolicy', () => ({ default: () => <div data-testid="privacy-page">PrivacyPolicy</div> }))
vi.mock('./pages/AdminLogin', () => ({ default: () => <div data-testid="admin-login">AdminLogin</div> }))
vi.mock('./pages/AdminDashboard', () => ({ default: () => <div data-testid="admin-dashboard">AdminDashboard</div> }))
vi.mock('./pages/PDV', () => ({ default: () => <div data-testid="pdv-page">PDV</div> }))

// Mock CookieConsent
vi.mock('./components/CookieConsent', () => ({
  CookieConsent: () => <div data-testid="cookie-consent" />,
}))

// Mock ErrorBoundary
vi.mock('./components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Mock UI components
vi.mock('./components/ui/loading', () => ({
  LoadingPage: () => <div data-testid="loading-page">Loading...</div>,
}))

vi.mock('./components/ui/skip-link', () => ({
  SkipLink: () => <a data-testid="skip-link" />,
}))

vi.mock('./components/ui/offline-banner', () => ({
  OfflineBanner: () => <div data-testid="offline-banner" />,
}))

vi.mock('sonner', () => ({
  Toaster: () => <div data-testid="toaster" />,
}))

import App from './App'

// ── Helper to reset auth state ────────────────────────────────

function resetAuthState() {
  mockAuthState.user = null
  mockAuthState.role = null
  mockAuthState.loading = false
  mockAuthState.emailVerified = false
  mockAuthState.signOut = vi.fn()
  mockAuthState.signIn = vi.fn()
  mockAuthState.authReady = true
  mockAuthState.refreshAuth = vi.fn()
}

// ── Tests ──────────────────────────────────────────────────────

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetAuthState()
    window.history.pushState({}, '', '/')
  })

  it('renders without crashing', () => {
    render(<App />)
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('renders skip link', () => {
    render(<App />)
    expect(screen.getByTestId('skip-link')).toBeInTheDocument()
  })

  it('renders offline banner', () => {
    render(<App />)
    expect(screen.getByTestId('offline-banner')).toBeInTheDocument()
  })

  it('renders cookie consent', () => {
    render(<App />)
    expect(screen.getByTestId('cookie-consent')).toBeInTheDocument()
  })

  it('renders toaster', () => {
    render(<App />)
    expect(screen.getByTestId('toaster')).toBeInTheDocument()
  })

  it('renders main content area with id', () => {
    render(<App />)
    const main = screen.getByRole('main')
    expect(main).toHaveAttribute('id', 'main-content')
  })

  it('renders subscribe page at root path (member mode default redirect)', async () => {
    window.history.pushState({}, '', '/')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('subscribe-page')).toBeInTheDocument()
    })
  })

  it('renders login page at /login', async () => {
    window.history.pushState({}, '', '/login')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeInTheDocument()
    })
  })

  // ─── Member mode route rendering ──────────────────────────

  it('renders terms page at /termos', async () => {
    window.history.pushState({}, '', '/termos')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('terms-page')).toBeInTheDocument()
    })
  })

  it('renders privacy page at /privacidade', async () => {
    window.history.pushState({}, '', '/privacidade')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('privacy-page')).toBeInTheDocument()
    })
  })

  it('redirects unknown routes to /assinar in member mode', async () => {
    window.history.pushState({}, '', '/nonexistent-route')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('subscribe-page')).toBeInTheDocument()
    })
  })

  // ─── Protected routes redirect unauthenticated users ─────

  it('redirects to /login when unauthenticated user visits /membro', async () => {
    window.history.pushState({}, '', '/membro')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeInTheDocument()
    })
  })

  it('redirects to /login when unauthenticated user visits /admin', async () => {
    window.history.pushState({}, '', '/admin')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeInTheDocument()
    })
  })

  it('redirects to /login when unauthenticated user visits /pdv', async () => {
    window.history.pushState({}, '', '/pdv')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeInTheDocument()
    })
  })

  // ─── Payment result routes ────────────────────────────────

  it('renders payment success page', async () => {
    window.history.pushState({}, '', '/pagamento/sucesso')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('PaymentResult-success')).toBeInTheDocument()
    })
  })

  it('renders payment error page', async () => {
    window.history.pushState({}, '', '/pagamento/erro')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('PaymentResult-error')).toBeInTheDocument()
    })
  })

  it('renders payment pending page', async () => {
    window.history.pushState({}, '', '/pagamento/pendente')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('PaymentResult-pending')).toBeInTheDocument()
    })
  })

  // ─── Authenticated member at /membro ──────────────────────

  it('renders member dashboard for authenticated member at /membro', async () => {
    mockAuthState.user = { uid: 'u1', email: 'member@test.com' }
    mockAuthState.role = 'member'
    mockAuthState.emailVerified = true

    window.history.pushState({}, '', '/membro')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('member-dashboard')).toBeInTheDocument()
    })
  })

  // ─── Access denied page ───────────────────────────────────

  it('shows access denied page at /acesso-negado', async () => {
    mockAuthState.user = { uid: 'u1', email: 'member@test.com' }
    mockAuthState.role = 'member'
    mockAuthState.emailVerified = true

    window.history.pushState({}, '', '/acesso-negado')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('Acesso Negado')).toBeInTheDocument()
    })
  })

  // ─── Loading state ────────────────────────────────────────

  it('shows loading state when auth is loading on protected route', async () => {
    mockAuthState.loading = true
    mockAuthState.authReady = false

    window.history.pushState({}, '', '/membro')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('loading-page')).toBeInTheDocument()
    })
  })

  // ─── RoleError (user authenticated but no role) ───────────

  it('shows RoleError when authenticated user has no role', async () => {
    mockAuthState.user = { uid: 'u1', email: 'norole@test.com' }
    mockAuthState.role = null

    window.history.pushState({}, '', '/membro')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('Usuário não cadastrado')).toBeInTheDocument()
    })
  })

  // ─── Admin at /admin ──────────────────────────────────────

  it('renders admin dashboard for authenticated admin at /admin', async () => {
    mockAuthState.user = { uid: 'a1', email: 'admin@test.com' }
    mockAuthState.role = 'admin'
    mockAuthState.emailVerified = true

    window.history.pushState({}, '', '/admin')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('admin-dashboard')).toBeInTheDocument()
    })
  })

  // ─── Seller at /pdv ───────────────────────────────────────

  it('renders PDV page for seller at /pdv', async () => {
    mockAuthState.user = { uid: 's1', email: 'seller@test.com' }
    mockAuthState.role = 'seller'
    mockAuthState.emailVerified = true

    window.history.pushState({}, '', '/pdv')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('pdv-page')).toBeInTheDocument()
    })
  })

  // ─── Admin at /pdv ────────────────────────────────────────

  it('renders PDV page for admin at /pdv', async () => {
    mockAuthState.user = { uid: 'a1', email: 'admin@test.com' }
    mockAuthState.role = 'admin'
    mockAuthState.emailVerified = true

    window.history.pushState({}, '', '/pdv')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('pdv-page')).toBeInTheDocument()
    })
  })

  // ─── Unverified member on /membro (no email verification required) ──

  it('allows unverified member on /membro (requireEmailVerification=false)', async () => {
    mockAuthState.user = { uid: 'u1', email: 'unverified@test.com' }
    mockAuthState.role = 'member'
    mockAuthState.emailVerified = false

    window.history.pushState({}, '', '/membro')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('member-dashboard')).toBeInTheDocument()
    })
  })

  // ─── Access denied page buttons ───────────────────────────

  it('access denied page has Sair button', async () => {
    mockAuthState.user = { uid: 'u1', email: 'member@test.com' }
    mockAuthState.role = 'member'
    mockAuthState.emailVerified = true

    window.history.pushState({}, '', '/acesso-negado')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('Sair')).toBeInTheDocument()
    })
  })

  it('access denied page shows redirect link for member', async () => {
    mockAuthState.user = { uid: 'u1', email: 'member@test.com' }
    mockAuthState.role = 'member'
    mockAuthState.emailVerified = true

    window.history.pushState({}, '', '/acesso-negado')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('Ir para Área do Membro')).toBeInTheDocument()
    })
  })

  // ─── RoleError sign out button ────────────────────────────

  it('RoleError sign out button calls signOut', async () => {
    const signOutFn = vi.fn()
    mockAuthState.user = { uid: 'u1', email: 'norole@test.com' }
    mockAuthState.role = null
    mockAuthState.signOut = signOutFn

    window.history.pushState({}, '', '/membro')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('Usuário não cadastrado')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Sair'))
    expect(signOutFn).toHaveBeenCalled()
  })

  // ─── Role-based access denied ─────────────────────────────

  it('redirects member to /acesso-negado when visiting /admin', async () => {
    mockAuthState.user = { uid: 'u1', email: 'member@test.com' }
    mockAuthState.role = 'member'
    mockAuthState.emailVerified = true

    window.history.pushState({}, '', '/admin')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('Acesso Negado')).toBeInTheDocument()
    })
  })

  it('redirects member to /acesso-negado when visiting /pdv', async () => {
    mockAuthState.user = { uid: 'u1', email: 'member@test.com' }
    mockAuthState.role = 'member'
    mockAuthState.emailVerified = true

    window.history.pushState({}, '', '/pdv')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('Acesso Negado')).toBeInTheDocument()
    })
  })

  // ─── Public pages render for unauthenticated users ────────

  it('renders register page at /cadastro', async () => {
    window.history.pushState({}, '', '/cadastro')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('register-page')).toBeInTheDocument()
    })
  })

  it('renders forgot password page at /recuperar-senha', async () => {
    window.history.pushState({}, '', '/recuperar-senha')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('forgot-password-page')).toBeInTheDocument()
    })
  })

  it('renders verify email page at /verificar-email', async () => {
    window.history.pushState({}, '', '/verificar-email')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('verify-email-page')).toBeInTheDocument()
    })
  })

  it('renders subscribe page at /assinar', async () => {
    window.history.pushState({}, '', '/assinar')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('subscribe-page')).toBeInTheDocument()
    })
  })
})
