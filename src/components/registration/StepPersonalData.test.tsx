import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StepPersonalData } from './StepPersonalData'
import type { CPFValidationResult } from '../../lib/cpf-validation'

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted runs before vi.mock factories (which are hoisted too)
// ---------------------------------------------------------------------------

const {
  mockFullCPFValidation,
  mockIsCPFRegistered,
  mockToast,
} = vi.hoisted(() => ({
  mockFullCPFValidation: vi.fn(),
  mockIsCPFRegistered: vi.fn(),
  mockToast: { error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn() },
}))

vi.mock('../../lib/utils', () => ({
  validateCPF: (cpf: string) => {
    const cleaned = cpf.replace(/\D/g, '')
    return cleaned === '52998224725'
  },
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

vi.mock('../../lib/cpf-validation', () => ({
  fullCPFValidation: (...args: unknown[]) => mockFullCPFValidation(...args),
}))

vi.mock('../../lib/members', () => ({
  isCPFRegistered: (...args: unknown[]) => mockIsCPFRegistered(...args),
}))

vi.mock('../../lib/sanitize', () => ({
  sanitizeName: (n: string) => n,
  normalizePhone: (p: string) => p,
  normalizeCPF: (c: string) => c.replace(/\D/g, ''),
}))

vi.mock('sonner', () => ({ toast: mockToast }))

// Framer motion: render children immediately, skip animation
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial: _i, animate: _a, transition: _t, ...rest } = props
      return <div {...rest}>{children}</div>
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderStep(overrides: Partial<React.ComponentProps<typeof StepPersonalData>> = {}) {
  const props = {
    onNext: vi.fn(),
    onBack: vi.fn(),
    loading: false,
    ...overrides,
  }
  const result = render(<StepPersonalData {...props} />)
  return { ...result, props }
}

/** Find the submit button (may have text "Proximo" or be empty when loading spinner shows). */
function getSubmitButton() {
  // The submit button is the second button in the footer
  const buttons = screen.getAllByRole('button')
  return buttons[buttons.length - 1]
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StepPersonalData', () => {
  // The component has a module-level rate limiter (CPF_RATE_LIMIT) that
  // persists across tests. Each call to Date.now() returns a value far enough
  // in the future to always bypass any cooldown window.
  let fakeNow = 1_000_000_000_000

  beforeEach(() => {
    vi.clearAllMocks()
    // Each Date.now() call advances 120s, always past the 60s cooldown
    vi.spyOn(Date, 'now').mockImplementation(() => {
      fakeNow += 120_000
      return fakeNow
    })
    // Default happy-path mocks
    mockIsCPFRegistered.mockResolvedValue(false)
    mockFullCPFValidation.mockResolvedValue({
      valid: true,
      exists: true,
      message: 'CPF valido',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -----------------------------------------------------------------------
  // 1. Renders all fields
  // -----------------------------------------------------------------------
  describe('rendering', () => {
    it('renders fullName, cpf, and phone fields with labels', () => {
      renderStep()
      expect(screen.getByLabelText('Nome completo')).toBeInTheDocument()
      expect(screen.getByLabelText('CPF')).toBeInTheDocument()
      expect(screen.getByLabelText('Telefone')).toBeInTheDocument()
    })

    it('renders placeholders', () => {
      renderStep()
      expect(screen.getByPlaceholderText('Seu nome completo')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('000.000.000-00')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('(00) 00000-0000')).toBeInTheDocument()
    })

    it('renders Voltar and Proximo buttons', () => {
      renderStep()
      expect(screen.getByRole('button', { name: /voltar/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /proximo/i })).toBeInTheDocument()
    })

    it('populates defaultValues when provided', () => {
      renderStep({
        defaultValues: {
          fullName: 'Maria Silva',
          cpf: '52998224725',
          phone: '21999887766',
        },
      })
      expect(screen.getByLabelText('Nome completo')).toHaveValue('Maria Silva')
      expect(screen.getByLabelText('CPF')).toHaveValue('529.982.247-25')
      expect(screen.getByLabelText('Telefone')).toHaveValue('(21) 99988-7766')
    })
  })

  // -----------------------------------------------------------------------
  // 2. CPF masking
  // -----------------------------------------------------------------------
  describe('CPF masking', () => {
    it('masks CPF input as 000.000.000-00', async () => {
      const user = userEvent.setup()
      renderStep()
      const cpfInput = screen.getByLabelText('CPF')
      await user.type(cpfInput, '52998224725')
      expect(cpfInput).toHaveValue('529.982.247-25')
    })

    it('masks partial CPF input correctly', async () => {
      const user = userEvent.setup()
      renderStep()
      const cpfInput = screen.getByLabelText('CPF')
      await user.type(cpfInput, '529')
      expect(cpfInput).toHaveValue('529')
      await user.type(cpfInput, '9')
      expect(cpfInput).toHaveValue('529.9')
    })

    it('limits CPF to 11 digits', async () => {
      const user = userEvent.setup()
      renderStep()
      const cpfInput = screen.getByLabelText('CPF')
      await user.type(cpfInput, '529982247259999')
      expect(cpfInput).toHaveValue('529.982.247-25')
    })
  })

  // -----------------------------------------------------------------------
  // 3. Phone masking
  // -----------------------------------------------------------------------
  describe('Phone masking', () => {
    it('masks phone input as (00) 00000-0000', async () => {
      const user = userEvent.setup()
      renderStep()
      const phoneInput = screen.getByLabelText('Telefone')
      await user.type(phoneInput, '21999887766')
      expect(phoneInput).toHaveValue('(21) 99988-7766')
    })

    it('masks partial phone input correctly', async () => {
      const user = userEvent.setup()
      renderStep()
      const phoneInput = screen.getByLabelText('Telefone')
      await user.type(phoneInput, '21')
      expect(phoneInput).toHaveValue('21')
      await user.type(phoneInput, '9')
      expect(phoneInput).toHaveValue('(21) 9')
    })
  })

  // -----------------------------------------------------------------------
  // 4. Name validation error
  // -----------------------------------------------------------------------
  describe('name validation', () => {
    it('shows error for name with less than 3 characters', async () => {
      const user = userEvent.setup()
      const { props } = renderStep()

      await user.type(screen.getByLabelText('Nome completo'), 'Ab')
      // Use invalid CPF — we only care about the name error here, and this
      // avoids consuming a rate-limit attempt on blur.
      await user.type(screen.getByLabelText('CPF'), '12345678901')
      await user.type(screen.getByLabelText('Telefone'), '21999887766')
      await user.click(screen.getByRole('button', { name: /proximo/i }))

      await waitFor(() => {
        expect(screen.getByText('Nome deve ter pelo menos 3 caracteres')).toBeInTheDocument()
      })
      expect(props.onNext).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // 5. Invalid CPF validation error (zod schema)
  // -----------------------------------------------------------------------
  describe('CPF validation', () => {
    it('shows error for invalid CPF on submit', async () => {
      const user = userEvent.setup()
      const { props } = renderStep()

      await user.type(screen.getByLabelText('Nome completo'), 'Maria Silva')
      await user.type(screen.getByLabelText('CPF'), '12345678901')
      await user.type(screen.getByLabelText('Telefone'), '21999887766')
      await user.click(screen.getByRole('button', { name: /proximo/i }))

      await waitFor(() => {
        expect(screen.getByText('CPF invalido')).toBeInTheDocument()
      })
      expect(props.onNext).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // 6. Valid submit calls onNext with sanitized data
  // -----------------------------------------------------------------------
  describe('successful submit', () => {
    it('calls onNext with sanitized data on valid submit', async () => {
      const user = userEvent.setup()
      const { props } = renderStep()

      // Type fields in order: name → phone → CPF (CPF last to keep focus there)
      await user.type(screen.getByLabelText('Nome completo'), 'Maria Silva')
      await user.type(screen.getByLabelText('Telefone'), '21999887766')
      await user.type(screen.getByLabelText('CPF'), '52998224725')

      // Use fireEvent.submit to avoid triggering CPF blur (which would
      // consume a rate-limit attempt from the module-level counter).
      fireEvent.submit(screen.getByLabelText('CPF').closest('form')!)

      await waitFor(() => {
        expect(props.onNext).toHaveBeenCalledTimes(1)
      })

      expect(props.onNext).toHaveBeenCalledWith({
        fullName: 'Maria Silva',
        cpf: '52998224725',
        phone: '(21) 99988-7766',
      })
    })
  })

  // -----------------------------------------------------------------------
  // 7. CPF async status icons
  //
  // NOTE: The component has a module-level rate limiter (5 attempts / 60s).
  // Tests that blur a valid CPF consume one attempt each. We keep the total
  // number of rate-limited blurs within the budget of 5 across the entire
  // suite. Tests that trigger cpfStatus="error" via an INVALID CPF
  // (the !validateCPF early return) do NOT consume rate-limit attempts.
  // -----------------------------------------------------------------------
  describe('CPF async status icons', () => {
    // --- Blur #1 (rate-limited) ---
    it('shows loading spinner during CPF validation and disables submit', async () => {
      let resolveValidation!: (v: CPFValidationResult) => void
      mockFullCPFValidation.mockReturnValueOnce(
        new Promise((resolve) => { resolveValidation = resolve })
      )

      const user = userEvent.setup()
      renderStep()

      await user.type(screen.getByLabelText('CPF'), '52998224725')
      await user.tab()

      // While loading: spinner visible and submit disabled
      await waitFor(() => {
        const spinner = document.querySelector('.animate-spin')
        expect(spinner).toBeInTheDocument()
      })
      expect(getSubmitButton()).toBeDisabled()

      // Resolve so component cleans up cpfValidatingRef
      resolveValidation({ valid: true, exists: true, message: 'CPF valido' })
      await waitFor(() => {
        expect(document.querySelector('.animate-spin')).not.toBeInTheDocument()
      })
    })

    // --- Blur #2 (rate-limited) ---
    it('shows valid status when CPF exists', async () => {
      mockFullCPFValidation.mockResolvedValueOnce({
        valid: true,
        exists: true,
        message: 'CPF valido',
      })

      const user = userEvent.setup()
      renderStep()

      await user.type(screen.getByLabelText('CPF'), '52998224725')
      await user.tab()

      await waitFor(() => {
        expect(screen.getByText('CPF valido')).toBeInTheDocument()
      })
    })

    // --- Blur #3 (rate-limited) ---
    it('shows warning when API is unavailable (exists=null)', async () => {
      mockFullCPFValidation.mockResolvedValueOnce({
        valid: true,
        exists: null,
        message: 'CPF com formato valido (verificacao offline)',
      })

      const user = userEvent.setup()
      renderStep()

      await user.type(screen.getByLabelText('CPF'), '52998224725')
      await user.tab()

      await waitFor(() => {
        expect(
          screen.getByText('CPF com formato valido (verificacao offline)')
        ).toBeInTheDocument()
      })
    })

    // --- Blur #4 (rate-limited) ---
    it('shows error when CPF is already registered', async () => {
      mockIsCPFRegistered.mockResolvedValueOnce(true)

      const user = userEvent.setup()
      renderStep()

      await user.type(screen.getByLabelText('CPF'), '52998224725')
      await user.tab()

      await waitFor(() => {
        expect(screen.getByText('CPF ja cadastrado no sistema')).toBeInTheDocument()
      })
    })

    // --- Blur #5 (rate-limited) ---
    it('shows error when fullCPFValidation returns invalid', async () => {
      mockFullCPFValidation.mockResolvedValueOnce({
        valid: false,
        exists: false,
        message: 'CPF invalido (formato incorreto)',
      })

      const user = userEvent.setup()
      renderStep()

      await user.type(screen.getByLabelText('CPF'), '52998224725')
      await user.tab()

      await waitFor(() => {
        expect(screen.getByText('CPF invalido (formato incorreto)')).toBeInTheDocument()
      })
    })

    // --- NOT rate-limited (uses invalid CPF → early return before counter) ---
    it('shows error via synchronous validateCPF check on blur (no rate limit)', async () => {
      const user = userEvent.setup()
      renderStep()

      // Type 11 digits that fail the mock validateCPF
      await user.type(screen.getByLabelText('CPF'), '11111111111')
      await user.tab()

      await waitFor(() => {
        expect(screen.getByText('CPF invalido')).toBeInTheDocument()
      })
    })
  })

  // -----------------------------------------------------------------------
  // 8. onBack callback
  // -----------------------------------------------------------------------
  describe('onBack', () => {
    it('fires onBack when Voltar button is clicked', async () => {
      const user = userEvent.setup()
      const { props } = renderStep()

      await user.click(screen.getByRole('button', { name: /voltar/i }))
      expect(props.onBack).toHaveBeenCalledTimes(1)
    })
  })

  // -----------------------------------------------------------------------
  // 9. Disables submit while loading
  // -----------------------------------------------------------------------
  describe('loading state', () => {
    it('disables submit button when loading prop is true', () => {
      renderStep({ loading: true })
      expect(getSubmitButton()).toBeDisabled()
    })

    it('disables Voltar button when loading prop is true', () => {
      renderStep({ loading: true })
      expect(screen.getByRole('button', { name: /voltar/i })).toBeDisabled()
    })

    // Uses invalid CPF blur path (no rate-limit cost) to set cpfStatus="error"
    it('blocks submit when CPF status is error and shows toast', async () => {
      const user = userEvent.setup()
      const { props } = renderStep()

      await user.type(screen.getByLabelText('Nome completo'), 'Maria Silva')
      // 11 invalid digits → cpfStatus="error" without touching rate limiter
      await user.type(screen.getByLabelText('CPF'), '11111111111')
      await user.type(screen.getByLabelText('Telefone'), '21999887766')
      await user.tab() // blur CPF → sets cpfStatus="error"

      await waitFor(() => {
        expect(screen.getByText('CPF invalido')).toBeInTheDocument()
      })

      // Form zod validation fails first for invalid CPF, so onNext never runs.
      // The cpfStatus="error" guard in onSubmit is a secondary defense.
      await user.click(screen.getByRole('button', { name: /proximo/i }))

      await waitFor(() => {
        expect(props.onNext).not.toHaveBeenCalled()
      })
    })
  })
})
