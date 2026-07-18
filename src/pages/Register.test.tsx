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
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={to} {...props}>{children}</a>
  ),
}))

const mockSignUp = vi.fn()
const mockSignInWithGoogle = vi.fn()
const mockUseAuth = vi.fn()
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock('../lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
}))

vi.mock('../lib/sanitize', () => ({
  normalizeCPF: (cpf: string) => cpf.replace(/\D/g, ''),
}))

vi.mock('../lib/email-validation', () => ({
  validateEmail: vi.fn().mockResolvedValue({ valid: true }),
}))

const mockCreateMember = vi.fn()
const mockIsCPFRegistered = vi.fn()
const mockGetMemberByUserId = vi.fn()
vi.mock('../lib/members', () => ({
  createMember: (...args: unknown[]) => mockCreateMember(...args),
  isCPFRegistered: (...args: unknown[]) => mockIsCPFRegistered(...args),
  getMemberByUserId: (...args: unknown[]) => mockGetMemberByUserId(...args),
}))

vi.mock('../lib/contract-storage', () => ({
  getMemberContract: vi.fn().mockResolvedValue(null),
}))

vi.mock('../lib/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/utils')>()
  return {
    ...actual,
    formatCurrency: (v: number) => `R$ ${v.toFixed(2)}`,
  }
})

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
  }),
}))

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial: _i, animate: _a, transition: _t, exit: _e, whileInView: _w, viewport: _v, whileHover: _h, layout: _l, ...rest } = props
      return <div {...rest}>{children}</div>
    },
  },
}))

vi.mock('lucide-react', () => {
  const icon = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <span {...props}>{children}</span>
  return { ArrowLeft: icon, Loader2: icon, AlertTriangle: icon }
})

// Registration step components — render as simple stubs
vi.mock('../components/registration/RegistrationStepper', () => ({
  RegistrationStepper: () => <div data-testid="registration-stepper" />,
}))

vi.mock('../components/registration/StepAccount', () => ({
  StepAccount: ({ onNext }: { onNext: (d: { email: string; password: string }) => void }) => (
    <div data-testid="step-account">
      <button data-testid="step-account-submit" onClick={() => onNext({ email: 'test@test.com', password: 'Pass1234' })}>
        Submit Account
      </button>
    </div>
  ),
}))

vi.mock('../components/registration/StepPersonalData', () => ({
  StepPersonalData: ({ onNext, onBack }: { onNext: (d: { fullName: string; cpf: string; phone: string }) => void; onBack: () => void }) => (
    <div data-testid="step-personal-data">
      <button data-testid="step-personal-submit" onClick={() => onNext({ fullName: 'Test User', cpf: '12345678901', phone: '11999999999' })}>
        Submit Personal
      </button>
      <button data-testid="step-personal-back" onClick={onBack}>Back</button>
    </div>
  ),
}))

vi.mock('../components/registration/StepContract', () => ({
  StepContract: ({ onSigned, onBack }: { onSigned: (c: unknown) => void; onBack: () => void }) => (
    <div data-testid="step-contract">
      <button data-testid="step-contract-sign" onClick={() => onSigned({ signature: 'test' })}>Sign</button>
      <button data-testid="step-contract-back" onClick={onBack}>Back</button>
    </div>
  ),
}))

vi.mock('../components/registration/StepPayment', () => ({
  StepPayment: ({ onSuccess, onBack }: { onSuccess: () => void; onBack: () => void }) => (
    <div data-testid="step-payment">
      <button data-testid="step-payment-success" onClick={onSuccess}>Pay</button>
      <button data-testid="step-payment-back" onClick={onBack}>Back</button>
    </div>
  ),
}))

vi.mock('../components/ui/section-error-boundary', () => ({
  SectionErrorBoundary: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// Import after all mocks
import Register from './Register'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultAuth() {
  return {
    user: null,
    emailVerified: false,
    signUp: mockSignUp,
    signInWithGoogle: mockSignInWithGoogle,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Register', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParamsMap = new Map()
    mockSearchParamsMap.set('plano', 'gold')
    mockSearchParamsMap.set('tipo', 'monthly')
    mockUseAuth.mockReturnValue(defaultAuth())
    mockGetMemberByUserId.mockResolvedValue(null)
    mockIsCPFRegistered.mockResolvedValue(false)
    mockCreateMember.mockResolvedValue({ id: 'member-1', fullName: 'Test User', email: 'test@test.com', cpf: '12345678901', phone: '' })
  })

  // ─── Initial Rendering ──────────────────────────────────────

  it('renders the registration page with header', () => {
    render(<Register />)
    expect(screen.getByText('Criar Conta')).toBeInTheDocument()
    expect(screen.getByText('Crie sua conta para comecar')).toBeInTheDocument()
  })

  it('renders the back link to plans', () => {
    render(<Register />)
    const link = screen.getByText('Voltar para planos')
    expect(link.closest('a')).toHaveAttribute('href', '/assinar')
  })

  it('renders plan summary badge with the single club plan (annual)', () => {
    render(<Register />)
    expect(screen.getByText('Clube Geek & Toys')).toBeInTheDocument()
    expect(screen.getByText('Anual')).toBeInTheDocument()
  })

  it('always shows the club plan regardless of legacy plano/tipo params', () => {
    // Params legados são ignorados: o clube tem plano único e anual.
    mockSearchParamsMap.set('plano', 'gold')
    mockSearchParamsMap.set('tipo', 'monthly')
    render(<Register />)
    expect(screen.getByText('Clube Geek & Toys')).toBeInTheDocument()
    expect(screen.getByText('Anual')).toBeInTheDocument()
    expect(screen.queryByText('Mensal')).not.toBeInTheDocument()
  })

  it('renders the stepper', () => {
    render(<Register />)
    expect(screen.getByTestId('registration-stepper')).toBeInTheDocument()
  })

  it('renders footer links', () => {
    render(<Register />)
    expect(screen.getByText('Fazer Login')).toBeInTheDocument()
    expect(screen.getByText('Termos de Uso')).toBeInTheDocument()
    expect(screen.getByText('Privacidade')).toBeInTheDocument()
  })

  // ─── Step 1a: Account Creation ───────────────────────────────

  it('shows StepAccount on initial render', () => {
    render(<Register />)
    expect(screen.getByTestId('step-account')).toBeInTheDocument()
  })

  // ─── Step 1b: Personal Data → Contract ──────────────────────

  it('shows StepPersonalData after account creation', async () => {
    mockSignUp.mockResolvedValue({ success: true })
    render(<Register />)

    fireEvent.click(screen.getByTestId('step-account-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('step-personal-data')).toBeInTheDocument()
    })
  })

  it('shows title "Seus Dados" when in personal data sub-step', async () => {
    mockSignUp.mockResolvedValue({ success: true })
    render(<Register />)

    fireEvent.click(screen.getByTestId('step-account-submit'))

    await waitFor(() => {
      expect(screen.getByText('Seus Dados')).toBeInTheDocument()
    })
  })

  // ─── Loading state for returning user ────────────────────────

  it('shows loading screen when user is set but initial check not done', () => {
    mockUseAuth.mockReturnValue({
      ...defaultAuth(),
      user: { id: '1', email: 'test@test.com' },
    })
    render(<Register />)
    expect(screen.getByText('Carregando...')).toBeInTheDocument()
  })

  // ─── Step 2: Missing memberId fallback ──────────────────────

  it('shows the club plan even when plano param is missing', () => {
    mockSearchParamsMap.delete('plano')
    render(<Register />)
    expect(screen.getByText('Clube Geek & Toys')).toBeInTheDocument()
  })

  // ─── Draft prompt ───────────────────────────────────────────

  it('renders without crashing when no draft in localStorage', () => {
    render(<Register />)
    expect(screen.queryByText(/cadastro em andamento/i)).not.toBeInTheDocument()
  })

  // ─── Login link ─────────────────────────────────────────────

  it('has a login link pointing to /login', () => {
    render(<Register />)
    const link = screen.getByText('Fazer Login')
    expect(link.closest('a')).toHaveAttribute('href', '/login')
  })

  // ─── handlePersonalDataComplete flow ────────────────────────

  describe('handlePersonalDataComplete', () => {
    it('creates member and transitions to step 2 (contract)', async () => {
      mockSignUp.mockResolvedValue({ success: true })
      mockIsCPFRegistered.mockResolvedValue(false)
      mockCreateMember.mockResolvedValue({ id: 'member-1', fullName: 'Test User', email: 'test@test.com', cpf: '12345678901', phone: '11999999999' })

      render(<Register />)

      // Step 1a: create account
      fireEvent.click(screen.getByTestId('step-account-submit'))
      await waitFor(() => {
        expect(screen.getByTestId('step-personal-data')).toBeInTheDocument()
      })

      // Step 1b: submit personal data
      fireEvent.click(screen.getByTestId('step-personal-submit'))

      // Should transition to step 2 (contract)
      await waitFor(() => {
        expect(screen.getByTestId('step-contract')).toBeInTheDocument()
      })

      expect(mockCreateMember).toHaveBeenCalled()
    })

    it('shows error when CPF is already registered', async () => {
      const { toast } = await import('sonner')
      mockSignUp.mockResolvedValue({ success: true })
      mockIsCPFRegistered.mockResolvedValue(true)

      render(<Register />)

      fireEvent.click(screen.getByTestId('step-account-submit'))
      await waitFor(() => {
        expect(screen.getByTestId('step-personal-data')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('step-personal-submit'))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Este CPF ja esta cadastrado',
          expect.objectContaining({ id: 'reg-progress' })
        )
      })
    })

    it('shows error when CPF check times out', async () => {
      const { toast } = await import('sonner')
      mockSignUp.mockResolvedValue({ success: true })
      mockIsCPFRegistered.mockImplementation(() => new Promise(() => {})) // never resolves

      render(<Register />)

      fireEvent.click(screen.getByTestId('step-account-submit'))
      await waitFor(() => {
        expect(screen.getByTestId('step-personal-data')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('step-personal-submit'))

      // The 5-second timeout should trigger
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Nao foi possivel verificar o CPF. Tente novamente.',
          expect.objectContaining({ id: 'reg-progress' })
        )
      }, { timeout: 7000 })
    }, 10000) // Extend test timeout to 10s since internal timeout is 5s

    it('retries member creation up to 3 times on failure', async () => {
      mockSignUp.mockResolvedValue({ success: true })
      mockIsCPFRegistered.mockResolvedValue(false)
      mockCreateMember
        .mockRejectedValueOnce(new Error('network error'))
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValueOnce({ id: 'member-retry', fullName: 'Test User', email: 'test@test.com', cpf: '12345678901', phone: '11999999999' })

      render(<Register />)

      fireEvent.click(screen.getByTestId('step-account-submit'))
      await waitFor(() => {
        expect(screen.getByTestId('step-personal-data')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('step-personal-submit'))

      await waitFor(() => {
        expect(screen.getByTestId('step-contract')).toBeInTheDocument()
      }, { timeout: 15000 })

      expect(mockCreateMember).toHaveBeenCalledTimes(3)
    })

    it('shows error after all 3 member creation retries fail', async () => {
      const { toast } = await import('sonner')
      mockSignUp.mockResolvedValue({ success: true })
      mockIsCPFRegistered.mockResolvedValue(false)
      mockCreateMember
        .mockRejectedValueOnce(new Error('fail-1'))
        .mockRejectedValueOnce(new Error('fail-2'))
        .mockRejectedValueOnce(new Error('fail-3'))

      render(<Register />)

      fireEvent.click(screen.getByTestId('step-account-submit'))
      await waitFor(() => {
        expect(screen.getByTestId('step-personal-data')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('step-personal-submit'))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Erro ao criar seu cadastro. Por favor, tente novamente.',
          expect.objectContaining({ id: 'reg-progress' })
        )
      }, { timeout: 15000 })
    })

    it('shows error when email is missing', async () => {
      const { toast } = await import('sonner')
      // User exists but with no email
      mockUseAuth.mockReturnValue({
        ...defaultAuth(),
        user: { id: 'u1', email: '' },
        emailVerified: false,
        signUp: mockSignUp,
        signInWithGoogle: mockSignInWithGoogle,
      })
      mockGetMemberByUserId.mockResolvedValue(null)

      render(<Register />)

      // Wait for initial check to finish and show personal data directly
      await waitFor(() => {
        expect(screen.getByTestId('step-personal-data')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('step-personal-submit'))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Email nao encontrado. Volte e crie sua conta novamente.',
          expect.objectContaining({ id: 'reg-progress' })
        )
      })
    })
  })

  // ─── handleContractSigned ──────────────────────────────────

  describe('handleContractSigned', () => {
    it('moves to step 3 (payment) after signing contract', async () => {
      const { toast } = await import('sonner')
      mockSignUp.mockResolvedValue({ success: true })
      mockIsCPFRegistered.mockResolvedValue(false)
      mockCreateMember.mockResolvedValue({ id: 'member-1', fullName: 'Test User', email: 'test@test.com', cpf: '12345678901', phone: '11999999999' })

      render(<Register />)

      // Step 1a -> 1b
      fireEvent.click(screen.getByTestId('step-account-submit'))
      await waitFor(() => {
        expect(screen.getByTestId('step-personal-data')).toBeInTheDocument()
      })

      // Step 1b -> 2
      fireEvent.click(screen.getByTestId('step-personal-submit'))
      await waitFor(() => {
        expect(screen.getByTestId('step-contract')).toBeInTheDocument()
      })

      // Step 2 -> 3: sign contract
      fireEvent.click(screen.getByTestId('step-contract-sign'))
      await waitFor(() => {
        expect(screen.getByTestId('step-payment')).toBeInTheDocument()
      })

      expect(toast.success).toHaveBeenCalledWith('Contrato assinado! Finalizando pagamento...')
    })
  })

  // ─── handlePaymentSuccess ──────────────────────────────────

  describe('handlePaymentSuccess', () => {
    it('navigates to /membro after successful payment', async () => {
      mockSignUp.mockResolvedValue({ success: true })
      mockIsCPFRegistered.mockResolvedValue(false)
      mockCreateMember.mockResolvedValue({ id: 'member-1', fullName: 'Test User', email: 'test@test.com', cpf: '12345678901', phone: '11999999999' })

      render(<Register />)

      // Step 1a -> 1b -> 2 -> 3
      fireEvent.click(screen.getByTestId('step-account-submit'))
      await waitFor(() => expect(screen.getByTestId('step-personal-data')).toBeInTheDocument())

      fireEvent.click(screen.getByTestId('step-personal-submit'))
      await waitFor(() => expect(screen.getByTestId('step-contract')).toBeInTheDocument())

      fireEvent.click(screen.getByTestId('step-contract-sign'))
      await waitFor(() => expect(screen.getByTestId('step-payment')).toBeInTheDocument())

      // Complete payment
      fireEvent.click(screen.getByTestId('step-payment-success'))

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/membro')
      })
    })
  })

  // ─── Step 2 without memberId (error fallback) ──────────────

  describe('step 2 without memberId', () => {
    it('shows error when member creation returns null', async () => {
      const { toast } = await import('sonner')
      mockSignUp.mockResolvedValue({ success: true })
      mockIsCPFRegistered.mockResolvedValue(false)
      // createMember returns null (no member created)
      mockCreateMember.mockResolvedValue(null)

      render(<Register />)

      // Step 1a -> 1b
      fireEvent.click(screen.getByTestId('step-account-submit'))
      await waitFor(() => expect(screen.getByTestId('step-personal-data')).toBeInTheDocument())

      // Try to submit personal data, but member creation fails
      fireEvent.click(screen.getByTestId('step-personal-submit'))

      // Should NOT transition to step 2 since member creation failed
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Erro ao criar seu cadastro. Por favor, tente novamente.',
          expect.objectContaining({ id: 'reg-progress' })
        )
      })
    })
  })

  // ─── Step 3 rendering ──────────────────────────────────────

  describe('step 3 rendering', () => {
    it('renders StepPayment at step 3 with back button to step 2', async () => {
      mockSignUp.mockResolvedValue({ success: true })
      mockIsCPFRegistered.mockResolvedValue(false)
      mockCreateMember.mockResolvedValue({ id: 'member-1', fullName: 'Test User', email: 'test@test.com', cpf: '12345678901', phone: '11999999999' })

      render(<Register />)

      // Navigate through steps 1a -> 1b -> 2 -> 3
      fireEvent.click(screen.getByTestId('step-account-submit'))
      await waitFor(() => expect(screen.getByTestId('step-personal-data')).toBeInTheDocument())

      fireEvent.click(screen.getByTestId('step-personal-submit'))
      await waitFor(() => expect(screen.getByTestId('step-contract')).toBeInTheDocument())

      fireEvent.click(screen.getByTestId('step-contract-sign'))
      await waitFor(() => expect(screen.getByTestId('step-payment')).toBeInTheDocument())

      // Step 3 back button should go to step 2
      fireEvent.click(screen.getByTestId('step-payment-back'))
      await waitFor(() => expect(screen.getByTestId('step-contract')).toBeInTheDocument())
    })

    it('shows correct step title for payment step', async () => {
      mockSignUp.mockResolvedValue({ success: true })
      mockIsCPFRegistered.mockResolvedValue(false)
      mockCreateMember.mockResolvedValue({ id: 'member-1', fullName: 'Test User', email: 'test@test.com', cpf: '12345678901', phone: '11999999999' })

      render(<Register />)

      fireEvent.click(screen.getByTestId('step-account-submit'))
      await waitFor(() => expect(screen.getByTestId('step-personal-data')).toBeInTheDocument())

      fireEvent.click(screen.getByTestId('step-personal-submit'))
      await waitFor(() => expect(screen.getByTestId('step-contract')).toBeInTheDocument())

      fireEvent.click(screen.getByTestId('step-contract-sign'))
      await waitFor(() => {
        expect(screen.getByText('Pagamento')).toBeInTheDocument()
        expect(screen.getByText('Finalize o pagamento para ativar')).toBeInTheDocument()
      })
    })
  })

  // ─── Returning user flows ──────────────────────────────────

  describe('returning user flows', () => {
    it('redirects active member to /membro', async () => {
      mockUseAuth.mockReturnValue({
        ...defaultAuth(),
        user: { id: 'u1', email: 'test@test.com' },
        emailVerified: true,
        signUp: mockSignUp,
        signInWithGoogle: mockSignInWithGoogle,
      })
      mockGetMemberByUserId.mockResolvedValue({
        id: 'member-1',
        fullName: 'Test User',
        email: 'test@test.com',
        cpf: '12345678901',
        phone: '',
        status: 'active',
      })

      render(<Register />)

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/membro', { replace: true })
      })
    })

    it('resumes at step 2 when member exists but no contract', async () => {
      const contractStorage = await import('../lib/contract-storage')
      vi.mocked(contractStorage.getMemberContract).mockResolvedValue(null)

      mockUseAuth.mockReturnValue({
        ...defaultAuth(),
        user: { id: 'u1', email: 'test@test.com' },
        emailVerified: true,
        signUp: mockSignUp,
        signInWithGoogle: mockSignInWithGoogle,
      })
      mockGetMemberByUserId.mockResolvedValue({
        id: 'member-2',
        fullName: 'Test User',
        email: 'test@test.com',
        cpf: '12345678901',
        phone: '11999999999',
        status: 'pending',
      })

      render(<Register />)

      await waitFor(() => {
        expect(screen.getByTestId('step-contract')).toBeInTheDocument()
      })
    })

    it('resumes at step 3 when member and contract exist', async () => {
      const contractStorage = await import('../lib/contract-storage')
      vi.mocked(contractStorage.getMemberContract).mockResolvedValue({ signed: true } as ReturnType<typeof contractStorage.getMemberContract> extends Promise<infer T> ? T : never)

      mockUseAuth.mockReturnValue({
        ...defaultAuth(),
        user: { id: 'u1', email: 'test@test.com' },
        emailVerified: true,
        signUp: mockSignUp,
        signInWithGoogle: mockSignInWithGoogle,
      })
      mockGetMemberByUserId.mockResolvedValue({
        id: 'member-3',
        fullName: 'Test User',
        email: 'test@test.com',
        cpf: '12345678901',
        phone: '11999999999',
        status: 'pending',
      })

      render(<Register />)

      await waitFor(() => {
        expect(screen.getByTestId('step-payment')).toBeInTheDocument()
      })
    })

    it('shows personal data step for user with no member record', async () => {
      mockUseAuth.mockReturnValue({
        ...defaultAuth(),
        user: { id: 'u1', email: 'user@test.com' },
        emailVerified: false,
        signUp: mockSignUp,
        signInWithGoogle: mockSignInWithGoogle,
      })
      mockGetMemberByUserId.mockResolvedValue(null)

      render(<Register />)

      await waitFor(() => {
        expect(screen.getByTestId('step-personal-data')).toBeInTheDocument()
      })
    })
  })

  // ─── handleAccountCreated error handling ────────────────────

  describe('handleAccountCreated errors', () => {
    it('shows error when signUp returns EMAIL_ALREADY_EXISTS', async () => {
      const { toast } = await import('sonner')
      mockSignUp.mockResolvedValue({
        success: false,
        code: 'EMAIL_ALREADY_EXISTS',
        error: 'Email already exists',
      })

      render(<Register />)
      fireEvent.click(screen.getByTestId('step-account-submit'))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Este email ja esta cadastrado.',
          expect.objectContaining({ id: 'reg-progress' })
        )
      })
    })

    it('shows generic error when signUp fails with other code', async () => {
      const { toast } = await import('sonner')
      mockSignUp.mockResolvedValue({
        success: false,
        code: 'UNKNOWN_ERROR',
        error: 'Something went wrong',
      })

      render(<Register />)
      fireEvent.click(screen.getByTestId('step-account-submit'))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Something went wrong',
          expect.objectContaining({ id: 'reg-progress' })
        )
      })
    })

    it('shows connection error when signUp throws', async () => {
      const { toast } = await import('sonner')
      mockSignUp.mockRejectedValue(new Error('Network error'))

      render(<Register />)
      fireEvent.click(screen.getByTestId('step-account-submit'))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Erro ao criar conta. Verifique sua conexao.',
          expect.objectContaining({ id: 'reg-progress' })
        )
      })
    })
  })

  // ─── Legacy plan/type params ───────────────────────────────

  describe('legacy URL params', () => {
    it('shows the annual club plan even when tipo param is missing', () => {
      mockSearchParamsMap.delete('tipo')
      render(<Register />)
      expect(screen.getByText('Anual')).toBeInTheDocument()
      expect(screen.queryByText('Mensal')).not.toBeInTheDocument()
    })
  })

  // ─── Step 1b back button ──────────────────────────────────

  describe('step 1b back button', () => {
    it('goes back to account step when back clicked on personal data', async () => {
      mockSignUp.mockResolvedValue({ success: true })

      render(<Register />)
      fireEvent.click(screen.getByTestId('step-account-submit'))
      await waitFor(() => expect(screen.getByTestId('step-personal-data')).toBeInTheDocument())

      fireEvent.click(screen.getByTestId('step-personal-back'))
      await waitFor(() => expect(screen.getByTestId('step-account')).toBeInTheDocument())
    })

    it('shows info toast instead of going back when account already exists', async () => {
      const { toast } = await import('sonner')
      mockUseAuth.mockReturnValue({
        ...defaultAuth(),
        user: { id: 'u1', email: 'test@test.com' },
        emailVerified: false,
        signUp: mockSignUp,
        signInWithGoogle: mockSignInWithGoogle,
      })
      mockGetMemberByUserId.mockResolvedValue(null)

      render(<Register />)

      await waitFor(() => expect(screen.getByTestId('step-personal-data')).toBeInTheDocument())

      fireEvent.click(screen.getByTestId('step-personal-back'))

      await waitFor(() => {
        expect(toast.info).toHaveBeenCalledWith('Sua conta ja existe. Complete os dados abaixo.')
      })

      // Should still show personal data (not go back to account)
      expect(screen.getByTestId('step-personal-data')).toBeInTheDocument()
    })
  })

  // ─── Step 2 contract back ─────────────────────────────────

  describe('step 2 contract back', () => {
    it('goes back to step 1 when back clicked on contract', async () => {
      mockSignUp.mockResolvedValue({ success: true })
      mockIsCPFRegistered.mockResolvedValue(false)
      mockCreateMember.mockResolvedValue({ id: 'member-1', fullName: 'Test User', email: 'test@test.com', cpf: '12345678901', phone: '11999999999' })

      render(<Register />)

      fireEvent.click(screen.getByTestId('step-account-submit'))
      await waitFor(() => expect(screen.getByTestId('step-personal-data')).toBeInTheDocument())

      fireEvent.click(screen.getByTestId('step-personal-submit'))
      await waitFor(() => expect(screen.getByTestId('step-contract')).toBeInTheDocument())

      fireEvent.click(screen.getByTestId('step-contract-back'))
      await waitFor(() => expect(screen.getByTestId('step-personal-data')).toBeInTheDocument())
    })
  })
})
