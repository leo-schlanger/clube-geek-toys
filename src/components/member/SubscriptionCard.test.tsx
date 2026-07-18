import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SubscriptionCard } from './SubscriptionCard'
import type { Member, Subscription } from '../../types'

// Mock SubscriptionManagement to avoid pulling in its dependencies
vi.mock('../SubscriptionManagement', () => ({
  SubscriptionManagement: (props: Record<string, unknown>) => (
    <div data-testid="subscription-management" data-member-id={props.memberId} />
  ),
}))

function createMember(overrides: Partial<Member> = {}): Member {
  return {
    id: 'member-1',
    userId: 'user-1',
    cpf: '12345678900',
    fullName: 'Test User',
    email: 'test@test.com',
    phone: '21999999999',
    plan: 'gold',
    status: 'active',
    paymentType: 'monthly',
    startDate: '2026-01-01',
    expiryDate: '2026-12-31',
    points: 100,
    paymentCount: 3,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  }
}

function createSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-1',
    memberId: 'member-1',
    providerId: 'stripe-sub-1',
    status: 'authorized',
    plan: 'gold',
    frequencyType: 'months',
    transactionAmount: 39.90,
    nextPaymentDate: '2026-06-01',
    lastPaymentDate: '2026-05-01',
    failedPayments: 0,
    cardLastFour: '4242',
    cardBrand: 'Visa',
    payerEmail: 'test@test.com',
    createdAt: '2026-01-01',
    ...overrides,
  }
}

describe('SubscriptionCard', () => {
  const defaultProps = {
    member: createMember(),
    onSubscriptionChange: vi.fn(),
  }

  it('shows empty state when no subscription', () => {
    render(
      <SubscriptionCard {...defaultProps} subscription={null} />
    )
    expect(screen.getByText('Sem assinatura recorrente')).toBeInTheDocument()
    expect(screen.getByText(/Sua assinatura é avulsa/)).toBeInTheDocument()
  })

  it('renders subscription title when subscription exists', () => {
    render(
      <SubscriptionCard {...defaultProps} subscription={createSubscription()} />
    )
    expect(screen.getByText('Assinatura Recorrente')).toBeInTheDocument()
  })

  it('shows authorized status badge', () => {
    render(
      <SubscriptionCard {...defaultProps} subscription={createSubscription({ status: 'authorized' })} />
    )
    expect(screen.getByText('Ativa')).toBeInTheDocument()
  })

  it('shows paused status badge', () => {
    render(
      <SubscriptionCard {...defaultProps} subscription={createSubscription({ status: 'paused' })} />
    )
    // "Pausada" appears in both the badge and the next payment field
    const elements = screen.getAllByText('Pausada')
    expect(elements.length).toBeGreaterThanOrEqual(1)
  })

  it('shows cancelled status badge', () => {
    render(
      <SubscriptionCard {...defaultProps} subscription={createSubscription({ status: 'cancelled' })} />
    )
    expect(screen.getByText('Cancelada')).toBeInTheDocument()
  })

  it('shows next payment date for authorized subscription', () => {
    render(
      <SubscriptionCard
        {...defaultProps}
        subscription={createSubscription({
          status: 'authorized',
          nextPaymentDate: '2026-06-01',
        })}
      />
    )
    expect(screen.getByText('01/06/2026')).toBeInTheDocument()
  })

  it('shows "Pausada" for next payment when paused', () => {
    render(
      <SubscriptionCard
        {...defaultProps}
        subscription={createSubscription({ status: 'paused' })}
      />
    )
    // "Pausada" appears both in badge and in the next payment section
    const pausedEls = screen.getAllByText('Pausada')
    expect(pausedEls.length).toBeGreaterThanOrEqual(2)
  })

  it('shows last payment date', () => {
    render(
      <SubscriptionCard
        {...defaultProps}
        subscription={createSubscription({ lastPaymentDate: '2026-05-01' })}
      />
    )
    expect(screen.getByText('01/05/2026')).toBeInTheDocument()
  })

  it('shows N/A when no last payment date', () => {
    render(
      <SubscriptionCard
        {...defaultProps}
        subscription={createSubscription({ lastPaymentDate: undefined })}
      />
    )
    const naElements = screen.getAllByText('N/A')
    expect(naElements.length).toBeGreaterThanOrEqual(1)
  })

  it('shows card info when available', () => {
    render(
      <SubscriptionCard
        {...defaultProps}
        subscription={createSubscription({ cardBrand: 'Mastercard', cardLastFour: '1234' })}
      />
    )
    expect(screen.getByText(/Mastercard \*\*\*\* 1234/)).toBeInTheDocument()
  })

  it('does not show card info when not available', () => {
    render(
      <SubscriptionCard
        {...defaultProps}
        subscription={createSubscription({ cardLastFour: undefined })}
      />
    )
    expect(screen.queryByText(/\*\*\*\*/)).not.toBeInTheDocument()
  })

  it('shows failed payments warning', () => {
    render(
      <SubscriptionCard
        {...defaultProps}
        subscription={createSubscription({ failedPayments: 2 })}
      />
    )
    expect(screen.getByText(/2 tentativa\(s\) de cobrança falharam/)).toBeInTheDocument()
  })

  it('does not show failed payments warning when zero', () => {
    render(
      <SubscriptionCard
        {...defaultProps}
        subscription={createSubscription({ failedPayments: 0 })}
      />
    )
    expect(screen.queryByText(/tentativa/)).not.toBeInTheDocument()
  })

  it('shows manage button', () => {
    render(
      <SubscriptionCard {...defaultProps} subscription={createSubscription()} />
    )
    expect(screen.getByText('Gerenciar Assinatura')).toBeInTheDocument()
  })

  it('toggles subscription management panel on button click', () => {
    render(
      <SubscriptionCard {...defaultProps} subscription={createSubscription()} />
    )
    expect(screen.queryByTestId('subscription-management')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Gerenciar Assinatura'))
    expect(screen.getByTestId('subscription-management')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Gerenciar Assinatura'))
    expect(screen.queryByTestId('subscription-management')).not.toBeInTheDocument()
  })
})
