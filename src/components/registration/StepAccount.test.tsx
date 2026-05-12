import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the component
// ---------------------------------------------------------------------------

vi.mock('../../lib/email-validation', () => ({
  validateEmail: vi.fn().mockResolvedValue({ valid: true }),
  isValidEmailFormat: vi.fn().mockReturnValue(true),
  isDisposableEmail: vi.fn().mockReturnValue(false),
  validateEmailSync: vi.fn().mockReturnValue({ valid: true }),
}))

vi.mock('../../lib/password-validation', () => ({
  PASSWORD_MIN_LENGTH: 8,
}))

vi.mock('../Turnstile', () => ({
  Turnstile: ({
    onVerify,
  }: {
    onVerify: (token: string) => void
    onExpire?: () => void
    onError?: () => void
  }) => (
    <div data-testid="turnstile-mock">
      <button
        type="button"
        data-testid="turnstile-verify"
        onClick={() => onVerify('mock-turnstile-token')}
      >
        Verify Turnstile
      </button>
    </div>
  ),
}))

vi.mock('../GoogleSignInButton', () => ({
  GoogleSignInButton: ({
    label,
    onSuccess,
    disabled,
  }: {
    label?: string
    onSuccess: (data: Record<string, unknown>) => void
    disabled?: boolean
  }) => (
    <button
      type="button"
      data-testid="google-signin"
      disabled={disabled}
      onClick={() => onSuccess({ email: 'google@test.com' })}
    >
      {label ?? 'Google Sign In'}
    </button>
  ),
}))

// Suppress framer-motion warnings in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) => {
      // Strip motion-specific props
      const {
        initial: _i,
        animate: _a,
        transition: _t,
        exit: _e,
        ...rest
      } = props
      return <div {...rest}>{children}</div>
    },
  },
}))

import { StepAccount } from './StepAccount'
import { validateEmail } from '../../lib/email-validation'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultProps = {
  onNext: vi.fn(),
  onGoogleSuccess: vi.fn(),
  loading: false,
}

function renderStep(overrides: Partial<typeof defaultProps> = {}) {
  return render(<StepAccount {...defaultProps} {...overrides} />)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StepAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset import.meta.env values relevant to the component
    // VITE_TURNSTILE_SITE_KEY is empty by default in test, so Turnstile is disabled
    // VITE_GOOGLE_CLIENT_ID is empty by default in test, so Google divider is hidden
  })

  // -------------------------------------------------------------------------
  // 1. Renders all fields
  // -------------------------------------------------------------------------

  describe('rendering', () => {
    it('renders the form with email, password, and confirm password fields', () => {
      renderStep()

      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/^senha$/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/confirmar senha/i)).toBeInTheDocument()
    })

    it('renders the submit button with "Criar Conta" text', () => {
      renderStep()

      expect(
        screen.getByRole('button', { name: /criar conta/i })
      ).toBeInTheDocument()
    })

    it('renders the Google Sign-In button', () => {
      renderStep()

      expect(screen.getByTestId('google-signin')).toBeInTheDocument()
    })

    it('renders the card title and description', () => {
      renderStep()

      // "Criar Conta" appears both in the heading and in the submit button,
      // so we target the heading specifically.
      expect(
        screen.getByRole('heading', { name: /criar conta/i })
      ).toBeInTheDocument()
      expect(
        screen.getByText(/escolha como deseja se cadastrar/i)
      ).toBeInTheDocument()
    })

    it('pre-fills email when defaultEmail is provided', () => {
      render(
        <StepAccount
          {...defaultProps}
          defaultEmail="prefilled@test.com"
        />
      )

      const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement
      expect(emailInput.value).toBe('prefilled@test.com')
    })
  })

  // -------------------------------------------------------------------------
  // 2. Password rules checklist
  // -------------------------------------------------------------------------

  describe('password rules checklist', () => {
    it('does not show the checklist when password is empty', () => {
      renderStep()

      expect(screen.queryByText(/pelo menos 8 caracteres/i)).not.toBeInTheDocument()
    })

    it('shows password rules checklist when user types in password', async () => {
      const user = userEvent.setup()
      renderStep()

      const passwordInput = screen.getByLabelText(/^senha$/i)
      await user.type(passwordInput, 'a')

      expect(screen.getByText(/pelo menos 8 caracteres/i)).toBeInTheDocument()
      expect(screen.getByText(/uma letra maiuscula/i)).toBeInTheDocument()
      expect(screen.getByText(/um numero/i)).toBeInTheDocument()
      expect(screen.getByText(/um caractere especial/i)).toBeInTheDocument()
    })

    it('marks rules as met when password satisfies them', async () => {
      const user = userEvent.setup()
      renderStep()

      const passwordInput = screen.getByLabelText(/^senha$/i)
      await user.type(passwordInput, 'Abcdefg1')

      // All required rules should be met (shown in green)
      const minLengthItem = screen.getByText(/pelo menos 8 caracteres/i)
      expect(minLengthItem.className).toContain('green')

      const uppercaseItem = screen.getByText(/uma letra maiuscula/i)
      expect(uppercaseItem.className).toContain('green')

      const numberItem = screen.getByText(/um numero/i)
      expect(numberItem.className).toContain('green')
    })

    it('shows unmet rules in red for weak passwords', async () => {
      const user = userEvent.setup()
      renderStep()

      const passwordInput = screen.getByLabelText(/^senha$/i)
      await user.type(passwordInput, 'abc')

      // Min length and uppercase and number should be unmet
      const minLengthItem = screen.getByText(/pelo menos 8 caracteres/i)
      expect(minLengthItem.className).toContain('red')

      const uppercaseItem = screen.getByText(/uma letra maiuscula/i)
      expect(uppercaseItem.className).toContain('red')

      const numberItem = screen.getByText(/um numero/i)
      expect(numberItem.className).toContain('red')
    })
  })

  // -------------------------------------------------------------------------
  // 3. Loading state
  // -------------------------------------------------------------------------

  describe('loading state', () => {
    it('disables submit button when loading is true', () => {
      renderStep({ loading: true })

      const submitButton = screen.getByRole('button', { name: /criar conta/i })
      expect(submitButton).toBeDisabled()
    })

    it('disables Google Sign-In button when loading is true', () => {
      renderStep({ loading: true })

      expect(screen.getByTestId('google-signin')).toBeDisabled()
    })

    it('does not disable submit button when loading is false', () => {
      renderStep({ loading: false })

      const submitButton = screen.getByRole('button', { name: /criar conta/i })
      expect(submitButton).not.toBeDisabled()
    })
  })

  // -------------------------------------------------------------------------
  // 4. Email validation on blur
  // -------------------------------------------------------------------------

  describe('email validation on blur', () => {
    it('calls validateEmail when email field loses focus with a value', async () => {
      const user = userEvent.setup()
      renderStep()

      const emailInput = screen.getByLabelText(/email/i)
      await user.type(emailInput, 'test@example.com')
      fireEvent.blur(emailInput)

      await waitFor(() => {
        expect(validateEmail).toHaveBeenCalledWith('test@example.com')
      })
    })

    it('does not call validateEmail on blur when email is empty', async () => {
      renderStep()

      const emailInput = screen.getByLabelText(/email/i)
      fireEvent.focus(emailInput)
      fireEvent.blur(emailInput)

      expect(validateEmail).not.toHaveBeenCalled()
    })

    it('shows error text when email validation returns invalid', async () => {
      const mockedValidateEmail = vi.mocked(validateEmail)
      mockedValidateEmail.mockResolvedValueOnce({
        valid: false,
        error: 'Emails temporarios nao sao permitidos',
      })

      const user = userEvent.setup()
      renderStep()

      const emailInput = screen.getByLabelText(/email/i)
      await user.type(emailInput, 'user@tempmail.com')
      fireEvent.blur(emailInput)

      await waitFor(() => {
        expect(
          screen.getByText(/emails temporarios nao sao permitidos/i)
        ).toBeInTheDocument()
      })
    })

    it('respects rate limiting after 5 calls', async () => {
      const mockedValidateEmail = vi.mocked(validateEmail)
      renderStep()

      const emailInput = screen.getByLabelText(/email/i)

      // Fire 5 blurs in quick succession to exhaust rate limit
      for (let i = 0; i < 5; i++) {
        fireEvent.change(emailInput, {
          target: { value: `user${i}@test.com` },
        })
        fireEvent.blur(emailInput)
      }

      await waitFor(() => {
        expect(mockedValidateEmail).toHaveBeenCalledTimes(5)
      })

      // 6th call should be rate limited
      fireEvent.change(emailInput, {
        target: { value: 'user6@test.com' },
      })
      fireEvent.blur(emailInput)

      // validateEmail should still have been called only 5 times
      await waitFor(() => {
        expect(
          screen.getByText(/muitas tentativas/i)
        ).toBeInTheDocument()
      })
    })
  })

  // -------------------------------------------------------------------------
  // 5. Password mismatch
  // -------------------------------------------------------------------------

  describe('password confirmation', () => {
    it('shows error when passwords do not match on submit', async () => {
      const user = userEvent.setup()
      renderStep()

      const emailInput = screen.getByLabelText(/email/i)
      const passwordInput = screen.getByLabelText(/^senha$/i)
      const confirmInput = screen.getByLabelText(/confirmar senha/i)

      await user.type(emailInput, 'test@example.com')
      await user.type(passwordInput, 'Abcdefg1')
      await user.type(confirmInput, 'DifferentPass1')

      const submitButton = screen.getByRole('button', { name: /criar conta/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(
          screen.getByText(/senhas nao conferem/i)
        ).toBeInTheDocument()
      })
    })

    it('does not call onNext when passwords do not match', async () => {
      const onNext = vi.fn()
      const user = userEvent.setup()
      renderStep({ onNext })

      const emailInput = screen.getByLabelText(/email/i)
      const passwordInput = screen.getByLabelText(/^senha$/i)
      const confirmInput = screen.getByLabelText(/confirmar senha/i)

      await user.type(emailInput, 'test@example.com')
      await user.type(passwordInput, 'Abcdefg1')
      await user.type(confirmInput, 'Mismatch1')

      const submitButton = screen.getByRole('button', { name: /criar conta/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/senhas nao conferem/i)).toBeInTheDocument()
      })

      expect(onNext).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // 6. Successful submission
  // -------------------------------------------------------------------------

  describe('form submission', () => {
    it('calls onNext with email and password on valid submit', async () => {
      const onNext = vi.fn()
      const user = userEvent.setup()
      renderStep({ onNext })

      const emailInput = screen.getByLabelText(/email/i)
      const passwordInput = screen.getByLabelText(/^senha$/i)
      const confirmInput = screen.getByLabelText(/confirmar senha/i)

      await user.type(emailInput, 'test@example.com')
      await user.type(passwordInput, 'Abcdefg1')
      await user.type(confirmInput, 'Abcdefg1')

      const submitButton = screen.getByRole('button', { name: /criar conta/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(onNext).toHaveBeenCalledTimes(1)
        expect(onNext).toHaveBeenCalledWith(
          expect.objectContaining({
            email: 'test@example.com',
            password: 'Abcdefg1',
          })
        )
      })
    })

    it('does not call onNext when password is too short', async () => {
      const onNext = vi.fn()
      const user = userEvent.setup()
      renderStep({ onNext })

      const emailInput = screen.getByLabelText(/email/i)
      const passwordInput = screen.getByLabelText(/^senha$/i)
      const confirmInput = screen.getByLabelText(/confirmar senha/i)

      await user.type(emailInput, 'test@example.com')
      await user.type(passwordInput, 'Ab1')
      await user.type(confirmInput, 'Ab1')

      const submitButton = screen.getByRole('button', { name: /criar conta/i })
      await user.click(submitButton)

      await waitFor(() => {
        // The zod error message starts with "Senha deve ter pelo menos..."
        expect(
          screen.getByText(/^senha deve ter pelo menos 8 caracteres$/i)
        ).toBeInTheDocument()
      })

      expect(onNext).not.toHaveBeenCalled()
    })

    it('does not call onNext when password has no uppercase', async () => {
      const onNext = vi.fn()
      const user = userEvent.setup()
      renderStep({ onNext })

      const emailInput = screen.getByLabelText(/email/i)
      const passwordInput = screen.getByLabelText(/^senha$/i)
      const confirmInput = screen.getByLabelText(/confirmar senha/i)

      await user.type(emailInput, 'test@example.com')
      await user.type(passwordInput, 'abcdefg1')
      await user.type(confirmInput, 'abcdefg1')

      const submitButton = screen.getByRole('button', { name: /criar conta/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(
          screen.getByText(/1 letra maiuscula/i)
        ).toBeInTheDocument()
      })

      expect(onNext).not.toHaveBeenCalled()
    })

    it('does not call onNext when password has no digit', async () => {
      const onNext = vi.fn()
      const user = userEvent.setup()
      renderStep({ onNext })

      const emailInput = screen.getByLabelText(/email/i)
      const passwordInput = screen.getByLabelText(/^senha$/i)
      const confirmInput = screen.getByLabelText(/confirmar senha/i)

      await user.type(emailInput, 'test@example.com')
      await user.type(passwordInput, 'Abcdefgh')
      await user.type(confirmInput, 'Abcdefgh')

      const submitButton = screen.getByRole('button', { name: /criar conta/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/1 numero/i)).toBeInTheDocument()
      })

      expect(onNext).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // 7. Turnstile CAPTCHA
  // -------------------------------------------------------------------------

  describe('Turnstile CAPTCHA', () => {
    it('renders the Turnstile mock component', () => {
      renderStep()

      expect(screen.getByTestId('turnstile-mock')).toBeInTheDocument()
    })

    // When VITE_TURNSTILE_SITE_KEY is set, the submit button should be disabled
    // until the user verifies with Turnstile. Since import.meta.env is read at
    // module load time and VITE_TURNSTILE_SITE_KEY is empty in tests, TURNSTILE_ENABLED
    // is false and the button is not gated by Turnstile verification by default.
    // We test the logic indirectly via the component's behavior: if Turnstile
    // is not configured, the button remains enabled regardless.
    it('submit button is enabled when Turnstile is not configured', () => {
      renderStep()

      const submitButton = screen.getByRole('button', { name: /criar conta/i })
      expect(submitButton).not.toBeDisabled()
    })
  })

  // -------------------------------------------------------------------------
  // Password visibility toggle
  // -------------------------------------------------------------------------

  describe('password visibility toggle', () => {
    it('toggles password visibility when eye icon is clicked', async () => {
      const user = userEvent.setup()
      renderStep()

      const passwordInput = screen.getByLabelText(
        /^senha$/i
      ) as HTMLInputElement
      expect(passwordInput.type).toBe('password')

      // Two toggle buttons exist (password + confirm); the first is for the password field
      const toggleButtons = screen.getAllByLabelText(/mostrar senha/i)
      await user.click(toggleButtons[0])

      expect(passwordInput.type).toBe('text')
    })

    it('toggles confirm password visibility independently', async () => {
      const user = userEvent.setup()
      renderStep()

      const confirmInput = screen.getByLabelText(
        /confirmar senha/i
      ) as HTMLInputElement
      expect(confirmInput.type).toBe('password')

      // There are two toggle buttons (password and confirm) — get all and click the second
      const toggleButtons = screen.getAllByLabelText(/mostrar senha/i)
      expect(toggleButtons.length).toBe(2)
      await user.click(toggleButtons[1])

      expect(confirmInput.type).toBe('text')
    })
  })

  // -------------------------------------------------------------------------
  // Google sign-in
  // -------------------------------------------------------------------------

  describe('Google Sign-In', () => {
    it('calls onGoogleSuccess when Google button is clicked', async () => {
      const onGoogleSuccess = vi.fn()
      const user = userEvent.setup()
      renderStep({ onGoogleSuccess })

      const googleButton = screen.getByTestId('google-signin')
      await user.click(googleButton)

      expect(onGoogleSuccess).toHaveBeenCalledWith({ email: 'google@test.com' })
    })
  })
})
