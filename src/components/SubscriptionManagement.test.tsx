import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SubscriptionManagement } from './SubscriptionManagement'
import type { Subscription, SubscriptionPayment } from '../types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetSubscriptionByMemberId = vi.fn()
const mockGetSubscriptionPayments = vi.fn()
const mockPauseSubscription = vi.fn()
const mockResumeSubscription = vi.fn()
const mockCancelSubscription = vi.fn()
const mockGetSubscriptionStatusLabel = vi.fn((s: string) => {
  const m: Record<string, string> = { authorized: 'Ativa', paused: 'Pausada', cancelled: 'Cancelada', pending: 'Pendente' }
  return m[s] || s
})
const mockGetSubscriptionStatusBadge = vi.fn(() => 'success' as const)
const mockGetFrequencyLabel = vi.fn((f: string) => (f === 'months' ? 'Mensal' : 'Anual'))
const mockFormatCardDisplay = vi.fn(() => '**** 1234')
const mockFormatNextPaymentDate = vi.fn(() => '15/06/2026')
const mockCanPauseSubscription = vi.fn(() => false)
const mockCanResumeSubscription = vi.fn(() => false)
const mockCanCancelSubscription = vi.fn(() => false)
const mockCanUpdateCard = vi.fn(() => false)

vi.mock('../lib/subscriptions', () => ({
  getSubscriptionByMemberId: (...args: unknown[]) => mockGetSubscriptionByMemberId(...args),
  getSubscriptionPayments: (...args: unknown[]) => mockGetSubscriptionPayments(...args),
  pauseSubscription: (...args: unknown[]) => mockPauseSubscription(...args),
  resumeSubscription: (...args: unknown[]) => mockResumeSubscription(...args),
  cancelSubscription: (...args: unknown[]) => mockCancelSubscription(...args),
  getSubscriptionStatusLabel: (...args: unknown[]) => mockGetSubscriptionStatusLabel(...args),
  getSubscriptionStatusBadge: (...args: unknown[]) => mockGetSubscriptionStatusBadge(...args),
  getFrequencyLabel: (...args: unknown[]) => mockGetFrequencyLabel(...args),
  formatCardDisplay: (...args: unknown[]) => mockFormatCardDisplay(...args),
  formatNextPaymentDate: (...args: unknown[]) => mockFormatNextPaymentDate(...args),
  canPauseSubscription: (...args: unknown[]) => mockCanPauseSubscription(...args),
  canResumeSubscription: (...args: unknown[]) => mockCanResumeSubscription(...args),
  canCancelSubscription: (...args: unknown[]) => mockCanCancelSubscription(...args),
  canUpdateCard: (...args: unknown[]) => mockCanUpdateCard(...args),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}))

vi.mock('../lib/logger', () => ({
  paymentLogger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

// Mock lucide-react icons as simple spans
vi.mock('lucide-react', () => {
  const icon = (name: string) => {
    const Comp = (props: Record<string, unknown>) => <span data-testid={`icon-${name}`} {...props} />
    Comp.displayName = name
    return Comp
  }
  return {
    CreditCard: icon('CreditCard'),
    Calendar: icon('Calendar'),
    Clock: icon('Clock'),
    Pause: icon('Pause'),
    Play: icon('Play'),
    X: icon('X'),
    XCircle: icon('XCircle'),
    History: icon('History'),
    CheckCircle: icon('CheckCircle'),
    AlertCircle: icon('AlertCircle'),
    ChevronDown: icon('ChevronDown'),
    ChevronUp: icon('ChevronUp'),
    Repeat: icon('Repeat'),
    Shield: icon('Shield'),
    Sparkles: icon('Sparkles'),
    RefreshCw: icon('RefreshCw'),
  }
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSub(overrides?: Partial<Subscription>): Subscription {
  return {
    id: 'sub-1',
    memberId: 'member-1',
    providerId: 'prov-1',
    status: 'authorized',
    plan: 'club',
    frequencyType: 'years',
    transactionAmount: 149.99,
    nextPaymentDate: '2026-06-15',
    failedPayments: 0,
    cardLastFour: '1234',
    cardBrand: 'Visa',
    payerEmail: 'user@test.com',
    createdAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

function makePayment(overrides?: Partial<SubscriptionPayment>): SubscriptionPayment {
  return {
    id: 'pay-1',
    subscriptionId: 'sub-1',
    memberId: 'member-1',
    amount: 39.9,
    status: 'approved',
    paymentDate: '2025-05-01T00:00:00Z',
    providerPaymentId: 'prov-pay-1',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SubscriptionManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSubscriptionByMemberId.mockResolvedValue(null)
    mockGetSubscriptionPayments.mockResolvedValue([])
  })

  // ---------- Loading state ----------
  it('should show loading spinner while fetching', () => {
    // Never-resolving promise keeps loading state
    mockGetSubscriptionByMemberId.mockReturnValue(new Promise(() => {}))
    render(<SubscriptionManagement memberId="m1" />)
    expect(screen.getByText('Carregando assinatura...')).toBeInTheDocument()
  })

  // ---------- No subscription ----------
  it('should show empty state when no subscription exists', async () => {
    mockGetSubscriptionByMemberId.mockResolvedValue(null)
    render(<SubscriptionManagement memberId="m1" />)

    await waitFor(() => {
      expect(screen.getByText('Assinatura Recorrente')).toBeInTheDocument()
    })
    expect(screen.getByText('Você ainda não possui uma assinatura ativa')).toBeInTheDocument()
    expect(screen.getByText('Cobrança automática')).toBeInTheDocument()
    expect(screen.getByText('Benefícios garantidos')).toBeInTheDocument()
    expect(screen.getByText('Cancele quando quiser')).toBeInTheDocument()
  })

  // ---------- Active subscription ----------
  it('should display subscription details when authorized', async () => {
    const sub = makeSub()
    mockGetSubscriptionByMemberId.mockResolvedValue(sub)
    mockGetSubscriptionPayments.mockResolvedValue([])

    render(<SubscriptionManagement memberId="member-1" />)

    await waitFor(() => {
      expect(screen.getByText('Clube GeekPop & Toys')).toBeInTheDocument()
    })
    expect(screen.getByText('**** 1234')).toBeInTheDocument()
    expect(screen.getByText('Anual')).toBeInTheDocument()
    expect(screen.getByText('15/06/2026')).toBeInTheDocument()
    expect(screen.getByText('Ativa')).toBeInTheDocument()
  })

  // ---------- Plan gradient (fixo para o plano único) ----------
  it('should apply the club plan gradient', async () => {
    mockGetSubscriptionByMemberId.mockResolvedValue(makeSub())
    mockGetSubscriptionPayments.mockResolvedValue([])

    const { container } = render(<SubscriptionManagement memberId="m1" />)

    await waitFor(() => {
      const gradient = container.querySelector('.from-violet-600')
      expect(gradient).toBeInTheDocument()
    })
  })

  // ---------- Failed payments warning ----------
  it('should show failed payments warning when failedPayments > 0', async () => {
    mockGetSubscriptionByMemberId.mockResolvedValue(makeSub({ failedPayments: 2 }))
    mockGetSubscriptionPayments.mockResolvedValue([])

    render(<SubscriptionManagement memberId="m1" />)

    await waitFor(() => {
      expect(screen.getByText('Problema com cobrança')).toBeInTheDocument()
      expect(screen.getByText(/2 tentativa\(s\)/)).toBeInTheDocument()
    })
  })

  // ---------- Paused warning ----------
  it('should show paused warning when status is paused', async () => {
    mockGetSubscriptionByMemberId.mockResolvedValue(makeSub({ status: 'paused' }))
    mockGetSubscriptionPayments.mockResolvedValue([])

    render(<SubscriptionManagement memberId="m1" />)

    await waitFor(() => {
      expect(screen.getByText('Assinatura pausada')).toBeInTheDocument()
      expect(screen.getByText(/Você não será cobrado/)).toBeInTheDocument()
    })
  })

  it('should show "Pausada" instead of next payment date when paused', async () => {
    mockGetSubscriptionByMemberId.mockResolvedValue(makeSub({ status: 'paused' }))
    mockGetSubscriptionPayments.mockResolvedValue([])

    render(<SubscriptionManagement memberId="m1" />)

    await waitFor(() => {
      // "Pausada" appears in both the status badge and the next payment area
      const allPausada = screen.getAllByText('Pausada')
      expect(allPausada.length).toBeGreaterThanOrEqual(1)
      // Verify the next payment section shows Pausada (it's a font-semibold <p>)
      const pausadaInPaymentSection = allPausada.find(
        el => el.tagName === 'P' && el.classList.contains('font-semibold')
      )
      expect(pausadaInPaymentSection).toBeTruthy()
    })
  })

  // ---------- N/A for cancelled ----------
  it('should show N/A for next payment when cancelled', async () => {
    mockGetSubscriptionByMemberId.mockResolvedValue(makeSub({ status: 'cancelled' }))
    mockGetSubscriptionPayments.mockResolvedValue([])

    render(<SubscriptionManagement memberId="m1" />)

    await waitFor(() => {
      expect(screen.getByText('N/A')).toBeInTheDocument()
    })
  })

  // ---------- Actions visibility ----------
  it('should show Pause button when canPause returns true', async () => {
    mockGetSubscriptionByMemberId.mockResolvedValue(makeSub())
    mockGetSubscriptionPayments.mockResolvedValue([])
    mockCanPauseSubscription.mockReturnValue(true)

    render(<SubscriptionManagement memberId="m1" />)

    await waitFor(() => {
      expect(screen.getByText('Pausar Assinatura')).toBeInTheDocument()
    })
  })

  it('should show Resume button when canResume returns true', async () => {
    mockGetSubscriptionByMemberId.mockResolvedValue(makeSub({ status: 'paused' }))
    mockGetSubscriptionPayments.mockResolvedValue([])
    mockCanResumeSubscription.mockReturnValue(true)

    render(<SubscriptionManagement memberId="m1" />)

    await waitFor(() => {
      expect(screen.getByText('Reativar Assinatura')).toBeInTheDocument()
    })
  })

  it('should show Cancel button when canCancel returns true', async () => {
    mockGetSubscriptionByMemberId.mockResolvedValue(makeSub())
    mockGetSubscriptionPayments.mockResolvedValue([])
    mockCanCancelSubscription.mockReturnValue(true)

    render(<SubscriptionManagement memberId="m1" />)

    await waitFor(() => {
      expect(screen.getByText('Cancelar')).toBeInTheDocument()
    })
  })

  it('should show Update card link when canUpdateCard returns true', async () => {
    mockGetSubscriptionByMemberId.mockResolvedValue(makeSub())
    mockGetSubscriptionPayments.mockResolvedValue([])
    mockCanUpdateCard.mockReturnValue(true)

    render(<SubscriptionManagement memberId="m1" />)

    await waitFor(() => {
      expect(screen.getByText('Atualizar cartão')).toBeInTheDocument()
    })
  })

  // ---------- Payment history toggle ----------
  it('should toggle payment history on button click', async () => {
    mockGetSubscriptionByMemberId.mockResolvedValue(makeSub())
    mockGetSubscriptionPayments.mockResolvedValue([])

    render(<SubscriptionManagement memberId="m1" />)

    await waitFor(() => {
      expect(screen.getByText('Histórico')).toBeInTheDocument()
    })

    // Initially hidden
    expect(screen.queryByText('Histórico de Cobranças')).not.toBeInTheDocument()

    // Click to show
    fireEvent.click(screen.getByText('Histórico'))
    expect(screen.getByText('Histórico de Cobranças')).toBeInTheDocument()
    expect(screen.getByText('Nenhuma cobrança registrada ainda')).toBeInTheDocument()

    // Click again to hide
    fireEvent.click(screen.getByText('Histórico'))
    expect(screen.queryByText('Histórico de Cobranças')).not.toBeInTheDocument()
  })

  it('should show payment history entries', async () => {
    const payments = [
      makePayment({ id: 'p1', status: 'approved', amount: 39.9 }),
      makePayment({ id: 'p2', status: 'rejected', amount: 39.9, paymentDate: '2025-04-01T00:00:00Z' }),
      makePayment({ id: 'p3', status: 'pending', amount: 39.9, paymentDate: '2025-03-01T00:00:00Z' }),
    ]
    mockGetSubscriptionByMemberId.mockResolvedValue(makeSub())
    mockGetSubscriptionPayments.mockResolvedValue(payments)

    render(<SubscriptionManagement memberId="m1" />)

    await waitFor(() => {
      expect(screen.getByText('Histórico')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Histórico'))

    expect(screen.getByText('3 cobrança(s)')).toBeInTheDocument()
    expect(screen.getByText('Aprovado')).toBeInTheDocument()
    expect(screen.getByText('Rejeitado')).toBeInTheDocument()
    expect(screen.getByText('Pendente')).toBeInTheDocument()
    expect(screen.getByText('Mais recente')).toBeInTheDocument()
  })

  // ---------- Confirm dialog: Pause ----------
  it('should open pause confirmation dialog and confirm', async () => {
    mockGetSubscriptionByMemberId.mockResolvedValue(makeSub())
    mockGetSubscriptionPayments.mockResolvedValue([])
    mockCanPauseSubscription.mockReturnValue(true)
    mockPauseSubscription.mockResolvedValue(true)

    render(<SubscriptionManagement memberId="m1" />)

    await waitFor(() => {
      expect(screen.getByText('Pausar Assinatura')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Pausar Assinatura'))

    expect(screen.getByText('Confirmar Pausa')).toBeInTheDocument()
    expect(screen.getByText(/Ao pausar sua assinatura/)).toBeInTheDocument()

    fireEvent.click(screen.getByText('Confirmar Pausa'))

    await waitFor(() => {
      expect(mockPauseSubscription).toHaveBeenCalledWith('sub-1')
    })
  })

  it('should show error toast when pause fails', async () => {
    const { toast } = await import('sonner')
    mockGetSubscriptionByMemberId.mockResolvedValue(makeSub())
    mockGetSubscriptionPayments.mockResolvedValue([])
    mockCanPauseSubscription.mockReturnValue(true)
    mockPauseSubscription.mockResolvedValue(false)

    render(<SubscriptionManagement memberId="m1" />)

    await waitFor(() => fireEvent.click(screen.getByText('Pausar Assinatura')))

    fireEvent.click(screen.getByText('Confirmar Pausa'))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Erro ao pausar assinatura')
    })
  })

  // ---------- Confirm dialog: Resume ----------
  it('should open resume confirmation dialog and confirm', async () => {
    mockGetSubscriptionByMemberId.mockResolvedValue(makeSub({ status: 'paused' }))
    mockGetSubscriptionPayments.mockResolvedValue([])
    mockCanResumeSubscription.mockReturnValue(true)
    mockResumeSubscription.mockResolvedValue(true)

    render(<SubscriptionManagement memberId="m1" />)

    await waitFor(() => {
      expect(screen.getByText('Reativar Assinatura')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Reativar Assinatura'))

    expect(screen.getByText('Confirmar Reativação')).toBeInTheDocument()
    expect(screen.getByText(/Ao reativar sua assinatura/)).toBeInTheDocument()
    // Resume info box
    expect(screen.getByText(/Sua próxima cobrança será processada/)).toBeInTheDocument()

    fireEvent.click(screen.getByText('Confirmar Reativação'))

    await waitFor(() => {
      expect(mockResumeSubscription).toHaveBeenCalledWith('sub-1')
    })
  })

  // ---------- Confirm dialog: Cancel ----------
  it('should open cancel confirmation dialog and show warnings', async () => {
    mockGetSubscriptionByMemberId.mockResolvedValue(makeSub())
    mockGetSubscriptionPayments.mockResolvedValue([])
    mockCanCancelSubscription.mockReturnValue(true)

    render(<SubscriptionManagement memberId="m1" />)

    await waitFor(() => {
      expect(screen.getByText('Cancelar')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Cancelar'))

    expect(screen.getByText('Cancelar Assinatura')).toBeInTheDocument()
    expect(screen.getByText(/Você perderá acesso a todos os benefícios/)).toBeInTheDocument()
  })

  it('should confirm cancel and call cancelSubscription', async () => {
    const { toast } = await import('sonner')
    mockGetSubscriptionByMemberId.mockResolvedValue(makeSub())
    mockGetSubscriptionPayments.mockResolvedValue([])
    mockCanCancelSubscription.mockReturnValue(true)
    mockCancelSubscription.mockResolvedValue(true)

    const onChange = vi.fn()
    render(<SubscriptionManagement memberId="m1" onSubscriptionChange={onChange} />)

    await waitFor(() => fireEvent.click(screen.getByText('Cancelar')))
    fireEvent.click(screen.getByText('Confirmar Cancelamento'))

    await waitFor(() => {
      expect(mockCancelSubscription).toHaveBeenCalledWith('sub-1')
      expect(toast.success).toHaveBeenCalledWith('Assinatura cancelada')
    })
  })

  it('should never show a points warning on cancel', async () => {
    mockGetSubscriptionByMemberId.mockResolvedValue(makeSub())
    mockGetSubscriptionPayments.mockResolvedValue([])
    mockCanCancelSubscription.mockReturnValue(true)

    render(<SubscriptionManagement memberId="m1" />)

    await waitFor(() => fireEvent.click(screen.getByText('Cancelar')))

    expect(screen.queryByText(/pontos acumulados serão perdidos/)).not.toBeInTheDocument()
  })

  // ---------- Voltar (back) button in dialog ----------
  it('should close dialog when Voltar is clicked', async () => {
    mockGetSubscriptionByMemberId.mockResolvedValue(makeSub())
    mockGetSubscriptionPayments.mockResolvedValue([])
    mockCanPauseSubscription.mockReturnValue(true)

    render(<SubscriptionManagement memberId="m1" />)

    await waitFor(() => fireEvent.click(screen.getByText('Pausar Assinatura')))
    expect(screen.getByText('Confirmar Pausa')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Voltar'))
    // Dialog should close (Confirmar Pausa goes away)
    await waitFor(() => {
      expect(screen.queryByText('Confirmar Pausa')).not.toBeInTheDocument()
    })
  })

  // ---------- Update card dialog ----------
  it('should open and close update card dialog', async () => {
    mockGetSubscriptionByMemberId.mockResolvedValue(makeSub())
    mockGetSubscriptionPayments.mockResolvedValue([])
    mockCanUpdateCard.mockReturnValue(true)

    render(<SubscriptionManagement memberId="m1" />)

    await waitFor(() => {
      expect(screen.getByText('Atualizar cartão')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Atualizar cartão'))
    expect(screen.getByText('Atualizar Cartão')).toBeInTheDocument()
    expect(screen.getByText(/Para atualizar o cartão, cancele a assinatura atual/)).toBeInTheDocument()

    fireEvent.click(screen.getByText('Entendi'))
    await waitFor(() => {
      expect(screen.queryByText('Atualizar Cartão')).not.toBeInTheDocument()
    })
  })

  // ---------- Subscription change callback ----------
  it('should call onSubscriptionChange after successful action', async () => {
    mockGetSubscriptionByMemberId.mockResolvedValue(makeSub({ status: 'paused' }))
    mockGetSubscriptionPayments.mockResolvedValue([])
    mockCanResumeSubscription.mockReturnValue(true)
    mockResumeSubscription.mockResolvedValue(true)

    const onChange = vi.fn()
    render(<SubscriptionManagement memberId="m1" onSubscriptionChange={onChange} />)

    await waitFor(() => fireEvent.click(screen.getByText('Reativar Assinatura')))
    fireEvent.click(screen.getByText('Confirmar Reativação'))

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled()
    })
  })

  // ---------- Fetch error handling ----------
  it('should handle fetch errors gracefully (shows empty state)', async () => {
    mockGetSubscriptionByMemberId.mockRejectedValue(new Error('Network error'))

    render(<SubscriptionManagement memberId="m1" />)

    await waitFor(() => {
      expect(screen.getByText('Você ainda não possui uma assinatura ativa')).toBeInTheDocument()
    })
  })

  // ---------- Authorized shows amount below next payment ----------
  it('should show transaction amount below next payment when authorized', async () => {
    mockGetSubscriptionByMemberId.mockResolvedValue(makeSub({ status: 'authorized', transactionAmount: 39.9 }))
    mockGetSubscriptionPayments.mockResolvedValue([])

    render(<SubscriptionManagement memberId="m1" />)

    await waitFor(() => {
      // The transactionAmount is rendered via formatCurrency
      const elements = screen.getAllByText(/R\$/)
      expect(elements.length).toBeGreaterThan(0)
    })
  })
})
