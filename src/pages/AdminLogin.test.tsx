import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ---------------------------------------------------------------------------
// Mocks — declared before importing the component
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

const mockSignIn = vi.fn()
const mockUseAuth = vi.fn()
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock('../lib/sanitize', () => ({
  normalizeEmail: (email: string) => email.trim().toLowerCase(),
}))

vi.mock('../lib/subdomain', () => ({
  getAppMode: () => 'admin',
  getLoginRedirectPath: (role: string) => (role === 'admin' ? '/admin' : '/membro'),
}))

const mockIsBlocked = vi.fn()
const mockRecordFailedAttempt = vi.fn()
const mockClearAttempts = vi.fn()
vi.mock('../lib/rate-limit', () => ({
  isBlocked: (...args: unknown[]) => mockIsBlocked(...args),
  recordFailedAttempt: (...args: unknown[]) => mockRecordFailedAttempt(...args),
  clearAttempts: (...args: unknown[]) => mockClearAttempts(...args),
}))

vi.mock('lucide-react', () => {
  const icon = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <span {...props}>{children}</span>
  return { Eye: icon, EyeOff: icon, Loader2: icon, ShieldAlert: icon }
})

vi.mock('../components/ui/loading', () => ({
  Loading: () => <div data-testid="loading-spinner">Loading...</div>,
}))

// Import after all mocks
import AdminLogin from './AdminLogin'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultAuth() {
  return {
    user: null,
    role: null,
    loading: false,
    error: null,
    signIn: mockSignIn,
  }
}

function getSubmitButton() {
  const buttons = screen.getAllByRole('button')
  const submit = buttons.find((b) => b.getAttribute('type') === 'submit')
  if (!submit) throw new Error('Submit button not found')
  return submit
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AdminLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsBlocked.mockReturnValue({ blocked: false, remainingTime: 0 })
    mockRecordFailedAttempt.mockReturnValue({ blocked: false, attemptsRemaining: 5, lockoutSeconds: 0 })
    mockUseAuth.mockReturnValue(defaultAuth())
  })

  // ─── Rendering ──────────────────────────────────────────────

  it('renders the admin login form with email and password fields', () => {
    render(<AdminLogin />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/senha/i)).toBeInTheDocument()
    expect(getSubmitButton()).toBeInTheDocument()
  })

  it('renders the title "Painel Administrativo"', () => {
    render(<AdminLogin />)
    expect(screen.getByText('Painel Administrativo')).toBeInTheDocument()
  })

  it('renders the description text', () => {
    render(<AdminLogin />)
    expect(screen.getByText('Geek & Toys - Acesso Restrito')).toBeInTheDocument()
  })

  it('renders the footer text', () => {
    render(<AdminLogin />)
    expect(screen.getByText(/exclusivo para administradores/i)).toBeInTheDocument()
  })

  it('shows "Acessar Painel" on the submit button', () => {
    render(<AdminLogin />)
    expect(getSubmitButton()).toHaveTextContent('Acessar Painel')
  })

  // ─── Loading state ──────────────────────────────────────────

  it('shows loading spinner when auth is loading', () => {
    mockUseAuth.mockReturnValue({ ...defaultAuth(), loading: true })
    render(<AdminLogin />)
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument()
  })

  // ─── Form submission ───────────────────────────────────────

  it('calls signIn with normalized email and password on submit', async () => {
    mockSignIn.mockResolvedValue({ success: true })
    render(<AdminLogin />)

    await userEvent.type(screen.getByLabelText(/email/i), 'ADMIN@TEST.COM')
    await userEvent.type(screen.getByLabelText(/senha/i), 'password123')
    fireEvent.click(getSubmitButton())

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('admin@test.com', 'password123')
    })
  })

  it('clears attempts after successful login', async () => {
    mockSignIn.mockResolvedValue({ success: true })
    render(<AdminLogin />)

    await userEvent.type(screen.getByLabelText(/email/i), 'admin@test.com')
    await userEvent.type(screen.getByLabelText(/senha/i), 'pass')
    fireEvent.click(getSubmitButton())

    await waitFor(() => {
      expect(mockClearAttempts).toHaveBeenCalledWith('admin@test.com')
    })
  })

  it('shows error on failed login', async () => {
    mockSignIn.mockResolvedValue({ success: false, error: 'Credenciais inválidas' })
    mockRecordFailedAttempt.mockReturnValue({ blocked: false, attemptsRemaining: 4, lockoutSeconds: 0 })
    render(<AdminLogin />)

    await userEvent.type(screen.getByLabelText(/email/i), 'admin@test.com')
    await userEvent.type(screen.getByLabelText(/senha/i), 'wrong')
    fireEvent.click(getSubmitButton())

    await waitFor(() => {
      expect(screen.getByText(/Credenciais inválidas/)).toBeInTheDocument()
    })
  })

  // ─── Lockout ───────────────────────────────────────────────

  it('shows lockout banner when blocked after too many attempts', async () => {
    mockSignIn.mockResolvedValue({ success: false, error: 'fail' })
    mockRecordFailedAttempt.mockReturnValue({ blocked: true, attemptsRemaining: 0, lockoutSeconds: 300 })
    render(<AdminLogin />)

    await userEvent.type(screen.getByLabelText(/email/i), 'admin@test.com')
    await userEvent.type(screen.getByLabelText(/senha/i), 'wrong')
    fireEvent.click(getSubmitButton())

    await waitFor(() => {
      expect(screen.getByText('Conta bloqueada')).toBeInTheDocument()
    })
  })

  it('prevents form submission when rate-limited', async () => {
    mockIsBlocked.mockReturnValue({ blocked: true, remainingTime: 120 })
    render(<AdminLogin />)

    await userEvent.type(screen.getByLabelText(/email/i), 'admin@test.com')
    await userEvent.type(screen.getByLabelText(/senha/i), 'pass')
    fireEvent.click(getSubmitButton())

    await waitFor(() => {
      expect(mockSignIn).not.toHaveBeenCalled()
    })
  })

  // ─── Navigation ─────────────────────────────────────────────

  it('redirects to /admin when already authenticated as admin', () => {
    mockUseAuth.mockReturnValue({
      ...defaultAuth(),
      user: { id: '1', email: 'admin@test.com', role: 'admin' },
      role: 'admin',
    })
    render(<AdminLogin />)
    expect(mockNavigate).toHaveBeenCalledWith('/admin', { replace: true })
  })

  // ─── Auth context error ─────────────────────────────────────

  it('shows "Usuário não cadastrado" when auth context has error', () => {
    mockUseAuth.mockReturnValue({
      ...defaultAuth(),
      error: 'NOT_ADMIN',
    })
    render(<AdminLogin />)
    expect(screen.getByText('Usuário não cadastrado')).toBeInTheDocument()
  })

  // ─── Password toggle ───────────────────────────────────────

  it('toggles password visibility', () => {
    render(<AdminLogin />)
    const passwordInput = screen.getByLabelText(/senha/i)
    expect(passwordInput).toHaveAttribute('type', 'password')

    const wrapper = passwordInput.closest('.relative')
    const toggle = wrapper?.querySelector('button')
    expect(toggle).toBeDefined()

    fireEvent.click(toggle!)
    expect(passwordInput).toHaveAttribute('type', 'text')
  })
})
