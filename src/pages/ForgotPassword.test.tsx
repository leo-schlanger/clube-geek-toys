import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ---------------------------------------------------------------------------
// Mocks — declared before importing the component
// ---------------------------------------------------------------------------

let mockSearchParamsMap = new Map<string, string>()
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [
    {
      get: (key: string) => mockSearchParamsMap.get(key) ?? null,
    },
  ],
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={to} {...props}>{children}</a>
  ),
}))

vi.mock('../lib/sanitize', () => ({
  normalizeEmail: (email: string) => email.trim().toLowerCase(),
}))

const mockSendPasswordResetEmail = vi.fn()
vi.mock('../lib/email', () => ({
  sendPasswordResetEmail: (...args: unknown[]) => mockSendPasswordResetEmail(...args),
}))

const mockApiPost = vi.fn()
vi.mock('../lib/api-client', () => ({
  api: {
    post: (...args: unknown[]) => mockApiPost(...args),
  },
}))

vi.mock('../lib/password-validation', () => ({
  PASSWORD_MIN_LENGTH: 8,
}))

vi.mock('lucide-react', () => {
  const icon = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <span {...props}>{children}</span>
  return {
    ArrowLeft: icon,
    Mail: icon,
    CheckCircle: icon,
    Eye: icon,
    EyeOff: icon,
    Shield: icon,
    Lock: icon,
  }
})

vi.mock('../components/ui/loading', () => ({
  Loading: () => <span data-testid="loading-spinner">Loading...</span>,
}))

// Import after all mocks
import ForgotPassword from './ForgotPassword'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ForgotPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParamsMap = new Map()
  })

  // ─── Request Reset Form (no token) ─────────────────────────

  describe('RequestResetForm', () => {
    it('renders the request form when no token present', () => {
      render(<ForgotPassword />)
      expect(screen.getByText('Recuperar Senha')).toBeInTheDocument()
      expect(screen.getByText(/Digite seu email/i)).toBeInTheDocument()
    })

    it('renders the email input', () => {
      render(<ForgotPassword />)
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    })

    it('renders the submit button', () => {
      render(<ForgotPassword />)
      expect(screen.getByText('Enviar Link de Recuperação')).toBeInTheDocument()
    })

    it('renders back to login link', () => {
      render(<ForgotPassword />)
      const link = screen.getByText('Voltar para o login')
      expect(link.closest('a')).toHaveAttribute('href', '/login')
    })

    it('submit button is disabled when email is empty', () => {
      render(<ForgotPassword />)
      const btn = screen.getByText('Enviar Link de Recuperação').closest('button')!
      expect(btn).toBeDisabled()
    })

    it('calls sendPasswordResetEmail on form submit', async () => {
      mockSendPasswordResetEmail.mockResolvedValue({ success: true })
      render(<ForgotPassword />)

      await userEvent.type(screen.getByLabelText(/email/i), 'user@test.com')
      fireEvent.click(screen.getByText('Enviar Link de Recuperação'))

      await waitFor(() => {
        expect(mockSendPasswordResetEmail).toHaveBeenCalledWith('user@test.com')
      })
    })

    it('shows success message after email is sent', async () => {
      mockSendPasswordResetEmail.mockResolvedValue({ success: true })
      render(<ForgotPassword />)

      await userEvent.type(screen.getByLabelText(/email/i), 'user@test.com')
      fireEvent.click(screen.getByText('Enviar Link de Recuperação'))

      await waitFor(() => {
        expect(screen.getByText('Email Enviado!')).toBeInTheDocument()
        expect(screen.getByText(/link expira em 1 hora/i)).toBeInTheDocument()
      })
    })

    it('shows error message when sending fails', async () => {
      mockSendPasswordResetEmail.mockResolvedValue({ success: false, error: 'Email not found' })
      render(<ForgotPassword />)

      await userEvent.type(screen.getByLabelText(/email/i), 'bad@test.com')
      fireEvent.click(screen.getByText('Enviar Link de Recuperação'))

      await waitFor(() => {
        expect(screen.getByText('Email not found')).toBeInTheDocument()
      })
    })

    it('shows generic error on exception', async () => {
      mockSendPasswordResetEmail.mockRejectedValue(new Error('network'))
      render(<ForgotPassword />)

      await userEvent.type(screen.getByLabelText(/email/i), 'user@test.com')
      fireEvent.click(screen.getByText('Enviar Link de Recuperação'))

      await waitFor(() => {
        expect(screen.getByText('Erro ao enviar email. Tente novamente.')).toBeInTheDocument()
      })
    })

    it('shows "Voltar para o login" link on success page', async () => {
      mockSendPasswordResetEmail.mockResolvedValue({ success: true })
      render(<ForgotPassword />)

      await userEvent.type(screen.getByLabelText(/email/i), 'test@test.com')
      fireEvent.click(screen.getByText('Enviar Link de Recuperação'))

      await waitFor(() => {
        const link = screen.getByText('Voltar para o login')
        expect(link.closest('a')).toHaveAttribute('href', '/login')
      })
    })
  })

  // ─── Reset Password Form (with token) ──────────────────────

  describe('ResetPasswordForm', () => {
    beforeEach(() => {
      mockSearchParamsMap.set('token', 'test-reset-token')
    })

    it('renders the reset password form when token is present', () => {
      render(<ForgotPassword />)
      expect(screen.getByRole('heading', { name: 'Nova Senha' })).toBeInTheDocument()
      expect(screen.getByText('Crie sua nova senha de acesso')).toBeInTheDocument()
    })

    it('renders password and confirm password fields', () => {
      render(<ForgotPassword />)
      expect(screen.getByLabelText('Nova Senha')).toBeInTheDocument()
      expect(screen.getByLabelText('Confirmar Nova Senha')).toBeInTheDocument()
    })

    it('renders the submit button', () => {
      render(<ForgotPassword />)
      expect(screen.getByText('Redefinir Senha')).toBeInTheDocument()
    })

    it('submit button is disabled when form is empty', () => {
      render(<ForgotPassword />)
      const btn = screen.getByText('Redefinir Senha').closest('button')!
      expect(btn).toBeDisabled()
    })

    it('shows password validation errors', async () => {
      render(<ForgotPassword />)
      await userEvent.type(screen.getByLabelText('Nova Senha'), 'short')

      await waitFor(() => {
        expect(screen.getByText(/Mínimo 8 caracteres/)).toBeInTheDocument()
      })
    })

    it('shows mismatch error when passwords do not match', async () => {
      render(<ForgotPassword />)
      await userEvent.type(screen.getByLabelText('Nova Senha'), 'Password1')
      await userEvent.type(screen.getByLabelText('Confirmar Nova Senha'), 'Password2')

      await waitFor(() => {
        expect(screen.getByText('Senhas não conferem')).toBeInTheDocument()
      })
    })

    it('shows password strength meter', async () => {
      render(<ForgotPassword />)
      await userEvent.type(screen.getByLabelText('Nova Senha'), 'P')

      await waitFor(() => {
        expect(screen.getByText('Fraca')).toBeInTheDocument()
      })
    })

    it('shows strong password indicator', async () => {
      render(<ForgotPassword />)
      await userEvent.type(screen.getByLabelText('Nova Senha'), 'StrongP@ss1')

      await waitFor(() => {
        expect(screen.getByText('Forte')).toBeInTheDocument()
      })
    })

    it('submits the form and shows success', async () => {
      mockApiPost.mockResolvedValue({})
      render(<ForgotPassword />)

      await userEvent.type(screen.getByLabelText('Nova Senha'), 'Password1')
      await userEvent.type(screen.getByLabelText('Confirmar Nova Senha'), 'Password1')
      fireEvent.click(screen.getByText('Redefinir Senha'))

      await waitFor(() => {
        expect(screen.getByText('Senha Redefinida!')).toBeInTheDocument()
      })
    })

    it('calls API with token and password', async () => {
      mockApiPost.mockResolvedValue({})
      render(<ForgotPassword />)

      await userEvent.type(screen.getByLabelText('Nova Senha'), 'Password1')
      await userEvent.type(screen.getByLabelText('Confirmar Nova Senha'), 'Password1')
      fireEvent.click(screen.getByText('Redefinir Senha'))

      await waitFor(() => {
        expect(mockApiPost).toHaveBeenCalledWith(
          '/auth/reset-password',
          { token: 'test-reset-token', password: 'Password1' },
          { skipAuth: true },
        )
      })
    })

    it('shows Fazer Login button on success', async () => {
      mockApiPost.mockResolvedValue({})
      render(<ForgotPassword />)

      await userEvent.type(screen.getByLabelText('Nova Senha'), 'Password1')
      await userEvent.type(screen.getByLabelText('Confirmar Nova Senha'), 'Password1')
      fireEvent.click(screen.getByText('Redefinir Senha'))

      await waitFor(() => {
        const link = screen.getByText('Fazer Login')
        expect(link.closest('a')).toHaveAttribute('href', '/login')
      })
    })

    it('shows error when API returns an error', async () => {
      mockApiPost.mockResolvedValue({ error: 'Token expirado ou inválido' })
      render(<ForgotPassword />)

      await userEvent.type(screen.getByLabelText('Nova Senha'), 'Password1')
      await userEvent.type(screen.getByLabelText('Confirmar Nova Senha'), 'Password1')
      fireEvent.click(screen.getByText('Redefinir Senha'))

      await waitFor(() => {
        expect(screen.getByText(/expirou ou é inválido/)).toBeInTheDocument()
      })
    })

    it('shows link to request new token when expired', async () => {
      mockApiPost.mockResolvedValue({ error: 'Token expirado' })
      render(<ForgotPassword />)

      await userEvent.type(screen.getByLabelText('Nova Senha'), 'Password1')
      await userEvent.type(screen.getByLabelText('Confirmar Nova Senha'), 'Password1')
      fireEvent.click(screen.getByText('Redefinir Senha'))

      await waitFor(() => {
        expect(screen.getByText('Solicitar novo link')).toBeInTheDocument()
      })
    })

    it('toggles password visibility', () => {
      render(<ForgotPassword />)
      const passwordInput = screen.getByLabelText('Nova Senha')
      expect(passwordInput).toHaveAttribute('type', 'password')

      const wrapper = passwordInput.closest('.relative')
      const toggle = wrapper?.querySelector('button')
      expect(toggle).toBeDefined()

      fireEvent.click(toggle!)
      expect(passwordInput).toHaveAttribute('type', 'text')
    })
  })
})
