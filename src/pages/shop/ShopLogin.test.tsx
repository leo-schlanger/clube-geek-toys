import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const mockSignIn = vi.fn()
const mockSignInWithGoogle = vi.fn()
const mockUseAuth = vi.fn()
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock('../../lib/sanitize', () => ({
  normalizeEmail: (e: string) => e.trim().toLowerCase(),
}))

vi.mock('../../lib/rate-limit', () => ({
  isBlocked: () => ({ blocked: false, remainingTime: 0 }),
  recordFailedAttempt: () => ({ blocked: false, attemptsRemaining: 5, lockoutSeconds: 0 }),
  clearAttempts: vi.fn(),
}))

vi.mock('../../components/GoogleSignInButton', () => ({
  GoogleSignInButton: () => <button type="button">Google</button>,
}))

vi.mock('../../components/ui/loading', () => ({
  Loading: () => <div data-testid="loading">Loading</div>,
}))

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial: _i, animate: _a, transition: _t, ...rest } = props
      return <div {...rest}>{children}</div>
    },
  },
}))

import ShopLogin from './ShopLogin'

describe('ShopLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      signIn: mockSignIn,
      signInWithGoogle: mockSignInWithGoogle,
    })
  })

  it('shows loading while auth loads', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: true,
      signIn: mockSignIn,
      signInWithGoogle: mockSignInWithGoogle,
    })
    render(
      <MemoryRouter>
        <ShopLogin />
      </MemoryRouter>
    )
    expect(screen.getByTestId('loading')).toBeInTheDocument()
  })

  it('renders login form for guest', () => {
    render(
      <MemoryRouter>
        <ShopLogin />
      </MemoryRouter>
    )
    expect(screen.getByRole('heading', { name: /Entrar/i })).toBeInTheDocument()
    expect(screen.getByText(/15% de desconto/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })

  it('redirects when already authenticated', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u1', email: 'a@b.com' },
      loading: false,
      signIn: mockSignIn,
      signInWithGoogle: mockSignInWithGoogle,
    })
    render(
      <MemoryRouter>
        <ShopLogin />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
    })
  })

  it('submits credentials via signIn', async () => {
    const user = userEvent.setup()
    mockSignIn.mockResolvedValue({ success: true })
    render(
      <MemoryRouter>
        <ShopLogin />
      </MemoryRouter>
    )
    await user.type(screen.getByLabelText(/email/i), 'membro@test.com')
    await user.type(screen.getByLabelText(/senha/i), 'Senha123')
    const submit = screen.getAllByRole('button').find((b) => b.getAttribute('type') === 'submit')
    expect(submit).toBeTruthy()
    await user.click(submit!)
    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('membro@test.com', 'Senha123')
    })
  })

  it('shows error on failed login', async () => {
    const user = userEvent.setup()
    mockSignIn.mockResolvedValue({ success: false, error: 'Credenciais inválidas' })
    render(
      <MemoryRouter>
        <ShopLogin />
      </MemoryRouter>
    )
    await user.type(screen.getByLabelText(/email/i), 'x@y.com')
    await user.type(screen.getByLabelText(/senha/i), 'wrong')
    const submit = screen.getAllByRole('button').find((b) => b.getAttribute('type') === 'submit')
    await user.click(submit!)
    await waitFor(() => {
      expect(screen.getByText(/Credenciais inválidas/i)).toBeInTheDocument()
    })
  })
})

