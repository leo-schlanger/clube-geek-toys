import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock @stripe/react-stripe-js
const mockUseStripe = vi.fn()
const mockUseElements = vi.fn()

vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <div data-testid="stripe-elements">{children}</div>,
  PaymentElement: ({ onReady }: { onReady?: () => void }) => {
    // Simulate immediate ready
    if (onReady) setTimeout(onReady, 0)
    return <div data-testid="payment-element">Payment Element</div>
  },
  useStripe: () => mockUseStripe(),
  useElements: () => mockUseElements(),
}))

// Mock stripe lib
vi.mock('../lib/stripe', () => ({
  getStripePromise: vi.fn().mockReturnValue(Promise.resolve({})),
}))

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

import { StripePaymentForm } from './StripePaymentForm'

describe('StripePaymentForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseStripe.mockReturnValue({ confirmPayment: vi.fn() })
    mockUseElements.mockReturnValue({})
  })

  it('should render loading state when clientSecret is empty', () => {
    render(
      <StripePaymentForm
        clientSecret=""
        onSuccess={vi.fn()}
      />
    )
    expect(screen.getByText('Preparando pagamento...')).toBeInTheDocument()
  })

  it('should render Elements provider when clientSecret is provided', () => {
    render(
      <StripePaymentForm
        clientSecret="pi_test_secret_123"
        onSuccess={vi.fn()}
      />
    )
    expect(screen.getByTestId('stripe-elements')).toBeInTheDocument()
  })

  it('should render PaymentElement inside the form', () => {
    render(
      <StripePaymentForm
        clientSecret="pi_test_secret_123"
        onSuccess={vi.fn()}
      />
    )
    expect(screen.getByTestId('payment-element')).toBeInTheDocument()
  })

  it('should show security badge after payment element is ready', async () => {
    render(
      <StripePaymentForm
        clientSecret="pi_test_secret_123"
        onSuccess={vi.fn()}
      />
    )
    await vi.waitFor(() => {
      expect(screen.getByText(/pagamento seguro/i)).toBeInTheDocument()
    })
  })

  it('should show submit button with default label', async () => {
    render(
      <StripePaymentForm
        clientSecret="pi_test_secret_123"
        onSuccess={vi.fn()}
      />
    )
    await vi.waitFor(() => {
      expect(screen.getByText('Confirmar Pagamento')).toBeInTheDocument()
    })
  })

  it('should show custom submit label', async () => {
    render(
      <StripePaymentForm
        clientSecret="pi_test_secret_123"
        onSuccess={vi.fn()}
        submitLabel="Pay Now"
      />
    )
    await vi.waitFor(() => {
      expect(screen.getByText('Pay Now')).toBeInTheDocument()
    })
  })

  it('should show formatted amount in button when amount is provided', async () => {
    render(
      <StripePaymentForm
        clientSecret="pi_test_secret_123"
        onSuccess={vi.fn()}
        amount={49.90}
      />
    )
    await vi.waitFor(() => {
      expect(screen.getByText('Pagar R$ 49,90')).toBeInTheDocument()
    })
  })

  it('should render cancel button when onCancel is provided', async () => {
    render(
      <StripePaymentForm
        clientSecret="pi_test_secret_123"
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    await vi.waitFor(() => {
      expect(screen.getByText('Voltar')).toBeInTheDocument()
    })
  })

  it('should not render cancel button when onCancel is not provided', async () => {
    render(
      <StripePaymentForm
        clientSecret="pi_test_secret_123"
        onSuccess={vi.fn()}
      />
    )
    await vi.waitFor(() => {
      expect(screen.getByText('Confirmar Pagamento')).toBeInTheDocument()
    })
    expect(screen.queryByText('Voltar')).not.toBeInTheDocument()
  })
})
