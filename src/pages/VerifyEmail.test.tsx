import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — declared before importing the component
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn()
let mockSearchParamsMap = new Map<string, string>()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [
    {
      get: (key: string) => mockSearchParamsMap.get(key) ?? null,
    },
  ],
}))

const mockSendVerificationEmail = vi.fn()
const mockRefreshUser = vi.fn()
const mockSignOut = vi.fn()
const mockUseAuth = vi.fn()
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

const mockVerifyEmailToken = vi.fn()
vi.mock('../lib/email', () => ({
  verifyEmailToken: (...args: unknown[]) => mockVerifyEmailToken(...args),
}))

vi.mock('../lib/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('lucide-react', () => {
  const icon = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <span {...props}>{children}</span>
  return {
    Mail: icon,
    CheckCircle: icon,
    RefreshCw: icon,
    LogOut: icon,
    AlertCircle: icon,
  }
})

// Import after all mocks
import VerifyEmail from './VerifyEmail'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultAuth() {
  return {
    user: { id: '1', email: 'test@example.com', role: 'member', emailVerified: false },
    emailVerified: false,
    loading: false,
    sendVerificationEmail: mockSendVerificationEmail,
    refreshUser: mockRefreshUser,
    signOut: mockSignOut,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VerifyEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParamsMap = new Map()
    mockUseAuth.mockReturnValue(defaultAuth())
    mockRefreshUser.mockResolvedValue(undefined)
    mockSignOut.mockResolvedValue({ success: true })
    // Clear localStorage mock
    vi.mocked(localStorage.getItem).mockReturnValue(null)
  })

  // ─── Default rendering (no token, authenticated, unverified) ─

  it('renders the verification page with user email', () => {
    render(<VerifyEmail />)
    expect(screen.getByText('Verifique seu Email')).toBeInTheDocument()
    expect(screen.getByText('test@example.com')).toBeInTheDocument()
  })

  it('renders the instructions', () => {
    render(<VerifyEmail />)
    expect(screen.getByText(/Acesse sua caixa de entrada/)).toBeInTheDocument()
    expect(screen.getByText(/Clique no link de verificação/)).toBeInTheDocument()
    expect(screen.getByText(/Volte aqui e clique em/)).toBeInTheDocument()
  })

  it('renders action buttons', () => {
    render(<VerifyEmail />)
    expect(screen.getByRole('button', { name: /já verifiquei/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reenviar email/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /usar outro email/i })).toBeInTheDocument()
  })

  it('renders spam tip', () => {
    render(<VerifyEmail />)
    expect(screen.getByText(/Verifique a pasta de spam/)).toBeInTheDocument()
  })

  // ─── Loading state ──────────────────────────────────────────

  it('shows loading spinner when auth is loading', () => {
    mockUseAuth.mockReturnValue({ ...defaultAuth(), loading: true })
    render(<VerifyEmail />)
    expect(screen.queryByText('Verifique seu Email')).not.toBeInTheDocument()
  })

  // ─── Redirect: unauthenticated without token ───────────────

  it('redirects to /login when not authenticated and no token', () => {
    mockUseAuth.mockReturnValue({ ...defaultAuth(), user: null })
    render(<VerifyEmail />)
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
  })

  it('redirects to /cadastro?step=verify when unauthenticated but draft exists', () => {
    mockUseAuth.mockReturnValue({ ...defaultAuth(), user: null })
    vi.mocked(localStorage.getItem).mockReturnValue('some-draft-data')
    render(<VerifyEmail />)
    expect(mockNavigate).toHaveBeenCalledWith('/cadastro?step=verify', { replace: true })
  })

  // ─── Redirect: already verified ────────────────────────────

  it('redirects to /membro when email is already verified and no token', () => {
    mockUseAuth.mockReturnValue({ ...defaultAuth(), emailVerified: true })
    render(<VerifyEmail />)
    expect(mockNavigate).toHaveBeenCalledWith('/membro', { replace: true })
  })

  // ─── Resend email ──────────────────────────────────────────

  it('sends verification email and shows success message', async () => {
    mockSendVerificationEmail.mockResolvedValue({ success: true })
    render(<VerifyEmail />)

    fireEvent.click(screen.getByRole('button', { name: /reenviar email/i }))

    await waitFor(() => {
      expect(mockSendVerificationEmail).toHaveBeenCalled()
      expect(screen.getByText(/Email de verificação enviado/)).toBeInTheDocument()
    })
  })

  it('shows error message when resend fails', async () => {
    mockSendVerificationEmail.mockResolvedValue({ success: false, error: 'Limite de envios atingido' })
    render(<VerifyEmail />)

    fireEvent.click(screen.getByRole('button', { name: /reenviar email/i }))

    await waitFor(() => {
      expect(screen.getByText('Limite de envios atingido')).toBeInTheDocument()
    })
  })

  it('shows cooldown after successful resend', async () => {
    mockSendVerificationEmail.mockResolvedValue({ success: true })
    render(<VerifyEmail />)

    fireEvent.click(screen.getByRole('button', { name: /reenviar email/i }))

    await waitFor(() => {
      expect(screen.getByText(/Reenviar em \d+s/)).toBeInTheDocument()
    })
  })

  // ─── Check verification ────────────────────────────────────

  it('calls refreshUser when "Já Verifiquei" is clicked', async () => {
    render(<VerifyEmail />)

    fireEvent.click(screen.getByRole('button', { name: /já verifiquei/i }))

    await waitFor(() => {
      expect(mockRefreshUser).toHaveBeenCalled()
    })
  })

  it('shows error when email is still not verified after check', async () => {
    render(<VerifyEmail />)

    fireEvent.click(screen.getByRole('button', { name: /já verifiquei/i }))

    // Wait for the 500ms setTimeout in handleCheckVerification
    await waitFor(() => {
      expect(screen.getByText(/Email ainda não verificado/)).toBeInTheDocument()
    }, { timeout: 2000 })
  })

  // ─── Logout ─────────────────────────────────────────────────

  it('calls signOut and navigates to /login when logout is clicked', async () => {
    render(<VerifyEmail />)

    fireEvent.click(screen.getByRole('button', { name: /usar outro email/i }))

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
    })
  })

  // ─── Token verification: success ───────────────────────────

  it('shows success message when token is valid', async () => {
    mockSearchParamsMap.set('token', 'valid-token-123')
    mockVerifyEmailToken.mockResolvedValue({ success: true, uid: '1' })
    render(<VerifyEmail />)

    await waitFor(() => {
      expect(screen.getByText('Email Verificado!')).toBeInTheDocument()
      expect(screen.getByText(/Seu email foi verificado com sucesso/)).toBeInTheDocument()
    })
  })

  it('calls refreshUser after successful token verification', async () => {
    mockSearchParamsMap.set('token', 'valid-token-123')
    mockVerifyEmailToken.mockResolvedValue({ success: true, uid: '1' })
    render(<VerifyEmail />)

    await waitFor(() => {
      expect(mockRefreshUser).toHaveBeenCalled()
    })
  })

  // ─── Token verification: errors ────────────────────────────

  it('shows error for TOKEN_ALREADY_USED', async () => {
    mockSearchParamsMap.set('token', 'used-token')
    mockVerifyEmailToken.mockResolvedValue({ success: false, code: 'TOKEN_ALREADY_USED' })
    render(<VerifyEmail />)

    await waitFor(() => {
      expect(screen.getByText('Erro na Verificação')).toBeInTheDocument()
      expect(screen.getByText(/já foi usado/)).toBeInTheDocument()
    })
  })

  it('shows error for TOKEN_INVALID', async () => {
    mockSearchParamsMap.set('token', 'invalid-token')
    mockVerifyEmailToken.mockResolvedValue({ success: false, code: 'TOKEN_INVALID' })
    render(<VerifyEmail />)

    await waitFor(() => {
      expect(screen.getByText('Erro na Verificação')).toBeInTheDocument()
      expect(screen.getByText(/inválido ou expirado/)).toBeInTheDocument()
    })
  })

  it('shows error for USER_NOT_FOUND', async () => {
    mockSearchParamsMap.set('token', 'bad-token')
    mockVerifyEmailToken.mockResolvedValue({ success: false, code: 'USER_NOT_FOUND' })
    render(<VerifyEmail />)

    await waitFor(() => {
      expect(screen.getByText(/Usuário não encontrado/)).toBeInTheDocument()
    })
  })

  it('shows generic error when token verification throws', async () => {
    mockSearchParamsMap.set('token', 'crash-token')
    mockVerifyEmailToken.mockRejectedValue(new Error('Network error'))
    render(<VerifyEmail />)

    await waitFor(() => {
      expect(screen.getByText('Erro na Verificação')).toBeInTheDocument()
      expect(screen.getByText(/Network error/)).toBeInTheDocument()
    })
  })

  it('shows "Fazer Login" button on token error page', async () => {
    mockSearchParamsMap.set('token', 'bad-token')
    mockVerifyEmailToken.mockResolvedValue({ success: false, code: 'TOKEN_INVALID' })
    render(<VerifyEmail />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /fazer login/i })).toBeInTheDocument()
    })
  })

  it('navigates to /login when "Fazer Login" is clicked on error page', async () => {
    mockSearchParamsMap.set('token', 'bad-token')
    mockVerifyEmailToken.mockResolvedValue({ success: false, code: 'TOKEN_INVALID' })
    render(<VerifyEmail />)

    await waitFor(() => {
      fireEvent.click(screen.getByRole('button', { name: /fazer login/i }))
    })

    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
  })

  // ─── Token verification: loading state ─────────────────────

  it('shows "Verificando seu email..." while verifying token', () => {
    mockSearchParamsMap.set('token', 'some-token')
    // Make the verification hang indefinitely
    mockVerifyEmailToken.mockReturnValue(new Promise(() => {}))
    render(<VerifyEmail />)

    expect(screen.getByText('Verificando seu email...')).toBeInTheDocument()
  })
})
