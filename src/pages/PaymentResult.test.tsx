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

const mockCheckPaymentStatus = vi.fn()
vi.mock('../lib/payments', () => ({
  checkPaymentStatus: (...args: unknown[]) => mockCheckPaymentStatus(...args),
}))

vi.mock('lucide-react', () => {
  const icon = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <span {...props}>{children}</span>
  return {
    CheckCircle: icon,
    XCircle: icon,
    Clock: icon,
    Home: icon,
    RefreshCw: icon,
    Loader2: icon,
  }
})

// Import after all mocks
import PaymentResult from './PaymentResult'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PaymentResult', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParamsMap = new Map()
    mockCheckPaymentStatus.mockResolvedValue(null)
  })

  // ─── Success type ─────────────────────────────────────────

  describe('success', () => {
    it('renders the success title', async () => {
      render(<PaymentResult type="success" />)
      await waitFor(() => {
        expect(screen.getByText('Pagamento Confirmado!')).toBeInTheDocument()
      })
    })

    it('renders the success description', async () => {
      render(<PaymentResult type="success" />)
      await waitFor(() => {
        expect(screen.getByText('Sua assinatura foi ativada com sucesso.')).toBeInTheDocument()
      })
    })

    it('renders "Ir para Minha Área" button', async () => {
      render(<PaymentResult type="success" />)
      await waitFor(() => {
        expect(screen.getByText('Ir para Minha Área')).toBeInTheDocument()
      })
    })

    it('navigates to /membro when "Ir para Minha Área" is clicked', async () => {
      render(<PaymentResult type="success" />)
      await waitFor(() => {
        fireEvent.click(screen.getByText('Ir para Minha Área'))
        expect(mockNavigate).toHaveBeenCalledWith('/membro')
      })
    })

    it('shows member area info text', async () => {
      render(<PaymentResult type="success" />)
      await waitFor(() => {
        expect(screen.getByText(/carteirinha digital/i)).toBeInTheDocument()
      })
    })
  })

  // ─── Error type ───────────────────────────────────────────

  describe('error', () => {
    it('renders the error title', async () => {
      render(<PaymentResult type="error" />)
      await waitFor(() => {
        expect(screen.getByText('Pagamento Não Aprovado')).toBeInTheDocument()
      })
    })

    it('renders possible failure reasons', async () => {
      render(<PaymentResult type="error" />)
      await waitFor(() => {
        expect(screen.getByText(/Saldo insuficiente/)).toBeInTheDocument()
        expect(screen.getByText(/Dados do cartão incorretos/)).toBeInTheDocument()
      })
    })

    it('renders "Início" and "Tentar Novamente" buttons', async () => {
      render(<PaymentResult type="error" />)
      await waitFor(() => {
        expect(screen.getByText('Início')).toBeInTheDocument()
        expect(screen.getByText('Tentar Novamente')).toBeInTheDocument()
      })
    })

    it('navigates to / when "Início" is clicked', async () => {
      render(<PaymentResult type="error" />)
      await waitFor(() => {
        fireEvent.click(screen.getByText('Início'))
        expect(mockNavigate).toHaveBeenCalledWith('/')
      })
    })

    it('navigates to /assinar when "Tentar Novamente" is clicked', async () => {
      render(<PaymentResult type="error" />)
      await waitFor(() => {
        fireEvent.click(screen.getByText('Tentar Novamente'))
        expect(mockNavigate).toHaveBeenCalledWith('/assinar')
      })
    })
  })

  // ─── Pending type ─────────────────────────────────────────

  describe('pending', () => {
    it('renders the pending title', async () => {
      render(<PaymentResult type="pending" />)
      await waitFor(() => {
        expect(screen.getByText('Pagamento Pendente')).toBeInTheDocument()
      })
    })

    it('renders the pending description', async () => {
      render(<PaymentResult type="pending" />)
      await waitFor(() => {
        expect(screen.getByText(/sendo processado/)).toBeInTheDocument()
      })
    })

    it('renders boleto info text', async () => {
      render(<PaymentResult type="pending" />)
      await waitFor(() => {
        expect(screen.getByText(/boleto/i)).toBeInTheDocument()
      })
    })

    it('renders "Início" button but NOT "Tentar Novamente"', async () => {
      render(<PaymentResult type="pending" />)
      await waitFor(() => {
        expect(screen.getByText('Início')).toBeInTheDocument()
        expect(screen.queryByText('Tentar Novamente')).not.toBeInTheDocument()
      })
    })
  })

  // ─── Loading / Validation ─────────────────────────────────

  it('shows loading while validating payment', () => {
    mockSearchParamsMap.set('payment_id', 'pay-123')
    mockCheckPaymentStatus.mockReturnValue(new Promise(() => {}))
    render(<PaymentResult type="pending" />)
    expect(screen.getByText('Verificando Pagamento...')).toBeInTheDocument()
  })

  // ─── Payment validation overrides initial type ────────────

  it('overrides initial type based on API response (paid)', async () => {
    mockSearchParamsMap.set('payment_id', 'pay-123')
    mockCheckPaymentStatus.mockResolvedValue('paid')
    render(<PaymentResult type="pending" />)
    await waitFor(() => {
      expect(screen.getByText('Pagamento Confirmado!')).toBeInTheDocument()
    })
  })

  it('overrides initial type based on API response (failed)', async () => {
    mockSearchParamsMap.set('payment_id', 'pay-123')
    mockCheckPaymentStatus.mockResolvedValue('failed')
    render(<PaymentResult type="success" />)
    await waitFor(() => {
      expect(screen.getByText('Pagamento Não Aprovado')).toBeInTheDocument()
    })
  })

  it('falls back to initial type when API returns null', async () => {
    mockSearchParamsMap.set('payment_id', 'pay-123')
    mockCheckPaymentStatus.mockResolvedValue(null)
    render(<PaymentResult type="success" />)
    await waitFor(() => {
      expect(screen.getByText('Pagamento Confirmado!')).toBeInTheDocument()
    })
  })

  it('falls back to initial type on API error', async () => {
    mockSearchParamsMap.set('payment_id', 'pay-123')
    mockCheckPaymentStatus.mockRejectedValue(new Error('network'))
    render(<PaymentResult type="error" />)
    await waitFor(() => {
      expect(screen.getByText('Pagamento Não Aprovado')).toBeInTheDocument()
    })
  })
})
