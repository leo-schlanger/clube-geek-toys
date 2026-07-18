import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ---------------------------------------------------------------------------
// Mocks — declared before importing the component
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn()
const mockSearchParams = new URLSearchParams()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [mockSearchParams],
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={to} {...props}>{children}</a>
  ),
}))

const mockSignIn = vi.fn()
const mockSignInWithGoogle = vi.fn()
const mockUseAuth = vi.fn()
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock('../lib/sanitize', () => ({
  normalizeEmail: (email: string) => email.trim().toLowerCase(),
}))

vi.mock('../lib/subdomain', () => ({
  getAppMode: () => 'member',
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

vi.mock('../components/GoogleSignInButton', () => ({
  GoogleSignInButton: ({
    label,
    disabled,
  }: {
    label?: string
    onSuccess: (data: Record<string, unknown>) => void
    onError?: (err: string) => void
    disabled?: boolean
  }) => (
    <button type="button" data-testid="google-signin" disabled={disabled}>
      {label ?? 'Google Sign In'}
    </button>
  ),
}))

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial: _i, animate: _a, transition: _t, exit: _e, whileInView: _w, viewport: _v, whileHover: _h, layout: _l, ...rest } = props
      return <div {...rest}>{children}</div>
    },
    li: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial: _i, animate: _a, transition: _t, ...rest } = props
      return <li {...rest}>{children}</li>
    },
  },
}))

vi.mock('lucide-react', () => {
  const icon = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <span {...props}>{children}</span>
  return {
    Eye: icon,
    EyeOff: icon,
    LogIn: icon,
    ShieldAlert: icon,
    Star: icon,
    Zap: icon,
    Shield: icon,
    Gift: icon,
  }
})

// Import the component after all mocks
import Login from './Login'

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
    signInWithGoogle: mockSignInWithGoogle,
  }
}

/** Get the submit button (type=submit), not the Google sign-in */
function getSubmitButton() {
  const buttons = screen.getAllByRole('button')
  const submit = buttons.find((b) => b.getAttribute('type') === 'submit')
  if (!submit) throw new Error('Submit button not found')
  return submit
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsBlocked.mockReturnValue({ blocked: false, remainingTime: 0 })
    mockRecordFailedAttempt.mockReturnValue({ blocked: false, attemptsRemaining: 5, lockoutSeconds: 0 })
    mockUseAuth.mockReturnValue(defaultAuth())
    // Reset search params
    mockSearchParams.delete('email')
  })

  // ─── Rendering ───────────────────────────────────────────────

  it('renders the login form with email and password fields', () => {
    render(<Login />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/senha/i)).toBeInTheDocument()
    expect(getSubmitButton()).toBeInTheDocument()
  })

  it('renders the branding heading', () => {
    render(<Login />)
    expect(screen.getByText('Clube GeekPop & Toys')).toBeInTheDocument()
  })

  it('renders the card title and description', () => {
    render(<Login />)
    expect(screen.getByText('Bem-vindo de volta')).toBeInTheDocument()
    expect(screen.getByText('Acesse sua área de membro')).toBeInTheDocument()
  })

  it('renders the "Criar conta e assinar" link', () => {
    render(<Login />)
    expect(screen.getByText('Criar conta e assinar')).toBeInTheDocument()
    expect(screen.getByText('Criar conta e assinar').closest('a')).toHaveAttribute('href', '/assinar')
  })

  it('renders the "Esqueceu a senha?" link', () => {
    render(<Login />)
    expect(screen.getByText('Esqueceu a senha?')).toBeInTheDocument()
  })

  // ─── Loading state ──────────────────────────────────────────

  it('shows loading spinner when auth is loading', () => {
    mockUseAuth.mockReturnValue({ ...defaultAuth(), loading: true })
    const { container } = render(<Login />)
    // Should not render the form
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument()
    // Should render a loading indicator
    expect(container.querySelector('.min-h-screen')).toBeInTheDocument()
  })

  // ─── Pre-fill email from search params ──────────────────────

  it('pre-fills email from search params', () => {
    mockSearchParams.set('email', 'test@example.com')
    render(<Login />)
    expect(screen.getByLabelText(/email/i)).toHaveValue('test@example.com')
  })

  // ─── Form submission ────────────────────────────────────────

  it('calls signIn with normalized email and password on form submit', async () => {
    mockSignIn.mockResolvedValue({ success: true })
    render(<Login />)

    await userEvent.type(screen.getByLabelText(/email/i), 'USER@EMAIL.COM')
    await userEvent.type(screen.getByLabelText(/senha/i), 'mypassword')
    fireEvent.click(getSubmitButton())

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('user@email.com', 'mypassword')
    })
  })

  it('clears attempts after successful login', async () => {
    mockSignIn.mockResolvedValue({ success: true })
    render(<Login />)

    await userEvent.type(screen.getByLabelText(/email/i), 'user@test.com')
    await userEvent.type(screen.getByLabelText(/senha/i), 'password123')
    fireEvent.click(getSubmitButton())

    await waitFor(() => {
      expect(mockClearAttempts).toHaveBeenCalledWith('user@test.com')
    })
  })

  it('shows error message on failed login', async () => {
    mockSignIn.mockResolvedValue({ success: false, error: 'Credenciais inválidas' })
    mockRecordFailedAttempt.mockReturnValue({ blocked: false, attemptsRemaining: 4, lockoutSeconds: 0 })
    render(<Login />)

    await userEvent.type(screen.getByLabelText(/email/i), 'user@test.com')
    await userEvent.type(screen.getByLabelText(/senha/i), 'wrongpassword')
    fireEvent.click(getSubmitButton())

    await waitFor(() => {
      expect(screen.getByText(/credenciais inválidas/i)).toBeInTheDocument()
    })
  })

  it('shows remaining attempts when fewer than 2 remain', async () => {
    mockSignIn.mockResolvedValue({ success: false, error: 'Senha incorreta' })
    mockRecordFailedAttempt.mockReturnValue({ blocked: false, attemptsRemaining: 1, lockoutSeconds: 0 })
    render(<Login />)

    await userEvent.type(screen.getByLabelText(/email/i), 'user@test.com')
    await userEvent.type(screen.getByLabelText(/senha/i), 'wrongpw')
    fireEvent.click(getSubmitButton())

    await waitFor(() => {
      expect(screen.getByText(/1 tentativa\(s\) restante\(s\)/)).toBeInTheDocument()
    })
  })

  // ─── Lockout ────────────────────────────────────────────────

  it('shows lockout banner when account is blocked after too many failed attempts', async () => {
    mockSignIn.mockResolvedValue({ success: false, error: 'Senha incorreta' })
    mockRecordFailedAttempt.mockReturnValue({ blocked: true, attemptsRemaining: 0, lockoutSeconds: 300 })
    render(<Login />)

    await userEvent.type(screen.getByLabelText(/email/i), 'user@test.com')
    await userEvent.type(screen.getByLabelText(/senha/i), 'wrongpw')
    fireEvent.click(getSubmitButton())

    await waitFor(() => {
      expect(screen.getByText('Conta bloqueada')).toBeInTheDocument()
    })
  })

  it('prevents submission when rate-limited', async () => {
    mockIsBlocked.mockReturnValue({ blocked: true, remainingTime: 120 })
    render(<Login />)

    await userEvent.type(screen.getByLabelText(/email/i), 'user@test.com')
    await userEvent.type(screen.getByLabelText(/senha/i), 'password')
    fireEvent.click(screen.getByRole('button', { name: /aguarde/i }))

    await waitFor(() => {
      expect(mockSignIn).not.toHaveBeenCalled()
    })
  })

  // ─── Navigation on auth ─────────────────────────────────────

  it('redirects to /membro when user is already authenticated with member role', () => {
    mockUseAuth.mockReturnValue({
      ...defaultAuth(),
      user: { id: '1', email: 'test@test.com', role: 'member', emailVerified: true },
      role: 'member',
    })

    render(<Login />)

    expect(mockNavigate).toHaveBeenCalledWith('/membro', { replace: true })
  })

  it('redirects to /admin when user has admin role', () => {
    mockUseAuth.mockReturnValue({
      ...defaultAuth(),
      user: { id: '1', email: 'admin@test.com', role: 'admin', emailVerified: true },
      role: 'admin',
    })

    render(<Login />)

    expect(mockNavigate).toHaveBeenCalledWith('/admin', { replace: true })
  })

  // ─── Auth context error ─────────────────────────────────────

  it('shows "Usuário não cadastrado" when auth context has error', () => {
    mockUseAuth.mockReturnValue({
      ...defaultAuth(),
      error: 'USER_NOT_FOUND',
    })
    render(<Login />)

    expect(screen.getByText('Usuário não cadastrado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /completar cadastro/i })).toBeInTheDocument()
  })

  it('navigates to /assinar when "Completar cadastro" is clicked', async () => {
    mockUseAuth.mockReturnValue({
      ...defaultAuth(),
      error: 'USER_NOT_FOUND',
    })
    render(<Login />)

    fireEvent.click(screen.getByRole('button', { name: /completar cadastro/i }))

    expect(mockNavigate).toHaveBeenCalledWith('/assinar')
  })

  // ─── Password visibility toggle ────────────────────────────

  it('toggles password visibility', async () => {
    render(<Login />)

    const passwordInput = screen.getByLabelText(/senha/i)
    expect(passwordInput).toHaveAttribute('type', 'password')

    // The toggle button is inside a div.relative wrapping the password input
    const passwordWrapper = passwordInput.closest('.relative')
    const toggleButton = passwordWrapper?.querySelector('button')
    expect(toggleButton).toBeDefined()

    fireEvent.click(toggleButton!)

    expect(passwordInput).toHaveAttribute('type', 'text')
  })
})
