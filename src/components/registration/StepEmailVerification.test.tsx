import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial: _i, animate: _a, transition: _t, exit: _e, ...rest } = props
      return <div {...rest}>{children}</div>
    },
  },
}))

const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
const mockToastInfo = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
    info: (...args: unknown[]) => mockToastInfo(...args),
  },
}))

vi.mock('lucide-react', () => {
  const icon = ({ children, ...props }: Record<string, unknown>) => (
    <span {...props}>{children as string}</span>
  )
  return { MailCheck: icon, Loader2: icon, RefreshCw: icon, CheckCircle: icon, Inbox: icon }
})

import { StepEmailVerification } from './StepEmailVerification'

// ─── Helpers ────────────────────────────────────────────────────────────────

const defaultProps = {
  email: 'test@example.com',
  onVerified: vi.fn(),
  onResend: vi.fn().mockResolvedValue({ success: true }),
  onRefreshUser: vi.fn().mockResolvedValue(undefined),
  emailVerified: false,
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('StepEmailVerification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the verification UI with email address', () => {
    render(<StepEmailVerification {...defaultProps} />)

    expect(screen.getByText(/verifique seu email/i)).toBeInTheDocument()
    expect(screen.getByText('test@example.com')).toBeInTheDocument()
  })

  it('renders "Ja verifiquei" button', () => {
    render(<StepEmailVerification {...defaultProps} />)

    expect(screen.getByRole('button', { name: /ja verifiquei/i })).toBeInTheDocument()
  })

  it('renders resend button', () => {
    render(<StepEmailVerification {...defaultProps} />)

    expect(screen.getByRole('button', { name: /reenviar email/i })).toBeInTheDocument()
  })

  it('renders auto-polling indicator', () => {
    render(<StepEmailVerification {...defaultProps} />)

    expect(screen.getByText(/verificando automaticamente/i)).toBeInTheDocument()
  })

  it('renders spam warning', () => {
    render(<StepEmailVerification {...defaultProps} />)

    expect(screen.getByText(/spam/i)).toBeInTheDocument()
  })

  it('calls onRefreshUser on polling interval', () => {
    render(<StepEmailVerification {...defaultProps} />)

    // Advance 5 seconds (1 poll)
    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(defaultProps.onRefreshUser).toHaveBeenCalled()
  })

  it('calls onVerified and shows toast when emailVerified becomes true', () => {
    const { rerender } = render(<StepEmailVerification {...defaultProps} />)

    rerender(<StepEmailVerification {...defaultProps} emailVerified />)

    expect(defaultProps.onVerified).toHaveBeenCalledTimes(1)
    expect(mockToastSuccess).toHaveBeenCalledWith('Email verificado com sucesso!')
  })

  it('calls onRefreshUser when "Ja verifiquei" is clicked', async () => {
    vi.useRealTimers() // userEvent needs real timers
    const user = userEvent.setup()
    render(<StepEmailVerification {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: /ja verifiquei/i }))

    expect(defaultProps.onRefreshUser).toHaveBeenCalled()
  })

  it('shows info toast if not verified after manual check', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    render(<StepEmailVerification {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: /ja verifiquei/i }))

    expect(mockToastInfo).toHaveBeenCalledWith(
      expect.stringContaining('nao verificado'),
    )
  })

  it('calls onResend and shows success toast on resend', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    render(<StepEmailVerification {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: /reenviar email/i }))

    expect(defaultProps.onResend).toHaveBeenCalledTimes(1)
    expect(mockToastSuccess).toHaveBeenCalledWith('Email reenviado com sucesso!')
  })

  it('shows error toast when resend fails', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    const onResend = vi.fn().mockResolvedValue({ success: false, error: 'Rate limited' })
    render(<StepEmailVerification {...defaultProps} onResend={onResend} />)

    await user.click(screen.getByRole('button', { name: /reenviar email/i }))

    expect(mockToastError).toHaveBeenCalledWith('Rate limited')
  })

  it('starts cooldown after successful resend', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    render(<StepEmailVerification {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: /reenviar email/i }))

    // Button should now show cooldown
    expect(screen.getByRole('button', { name: /reenviar email \(60s\)/i })).toBeDisabled()
  })
})
