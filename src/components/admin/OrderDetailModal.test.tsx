import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { Order } from '../../types'

/**
 * OrderDetailModal — the screen where an admin touches money.
 *
 * What these protect, ordered by what a regression costs:
 *
 *  1. **Refund is offered exactly when there is something to refund.** It is
 *     gated on the order having a charge at the operator, not on the payment
 *     method: PIX became refundable with the Pagar.me migration, and hiding the
 *     button for it sent the shop to the bank app to do by hand what the API
 *     does in one call. An order paid at the counter or fully covered by store
 *     credit has no charge and must not offer one.
 *  2. **The charge id is on screen.** "O cliente diz que pagou, cadê?" is
 *     answered by searching the operator's dashboard, and the panel is where
 *     someone looks. It used to exist only inside a notification e-mail.
 */

const { getOrderMock, refundOrderMock } = vi.hoisted(() => ({
  getOrderMock: vi.fn(),
  refundOrderMock: vi.fn(),
}))

vi.mock('../../lib/orders', () => ({
  getOrder: getOrderMock,
  updateOrderStatus: vi.fn(),
  confirmPixOrder: vi.fn(),
  refundOrder: refundOrderMock,
  setOrderTracking: vi.fn(),
}))
vi.mock('../../lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { OrderDetailModal } from './OrderDetailModal'

function order(over: Partial<Order> = {}): Order {
  return {
    id: 'o1',
    orderNumber: 1001,
    memberId: null,
    userId: 'u1',
    customerName: 'Laura',
    customerEmail: 'laura@example.com',
    customerPhone: null,
    deliveryMethod: 'shipping',
    shippingAddress: null,
    subtotal: 100,
    discount: 0,
    discountReason: null,
    shippingCost: 24,
    total: 124,
    status: 'paid',
    paymentMethod: 'pix',
    stripePaymentIntentId: null,
    pagarmeChargeId: 'ch_abc123',
    pixTxid: 'ch_abc123',
    paidAt: '2026-09-02T00:00:00Z',
    createdAt: '2026-09-02T00:00:00Z',
    updatedAt: '2026-09-02T00:00:00Z',
    items: [],
    ...over,
  } as Order
}

async function open(o: Order | null) {
  getOrderMock.mockResolvedValue(o)
  render(<OrderDetailModal orderId="o1" onClose={vi.fn()} onChanged={vi.fn()} />)
  await waitFor(() => expect(getOrderMock).toHaveBeenCalled())
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('OrderDetailModal — estorno', () => {
  /**
   * The rule that changed. Before Pagar.me the condition was `credit_card`
   * only, and it was correct then: the PIX code was ours, no provider saw it,
   * and the only way back was a manual transfer.
   */
  it('oferece estorno para um PIX pago, porque agora é cobrança de verdade', async () => {
    await open(order({ paymentMethod: 'pix', status: 'paid' }))

    expect(await screen.findByRole('button', { name: /reembolsar/i })).toBeInTheDocument()
  })

  it('oferece estorno para cartão pago', async () => {
    await open(order({ paymentMethod: 'credit_card', status: 'paid' }))

    expect(await screen.findByRole('button', { name: /reembolsar/i })).toBeInTheDocument()
  })

  /**
   * No charge, nothing to ask the acquirer for: a counter sale, or an order
   * paid entirely with store credit. Offering the button there would produce a
   * confusing failure at the exact moment someone is trying to give money back.
   */
  it('esconde o estorno quando não há cobrança na operadora', async () => {
    await open(
      order({ status: 'paid', pagarmeChargeId: null, stripePaymentIntentId: null })
    )

    await screen.findByText(/Laura/)
    expect(screen.queryByRole('button', { name: /reembolsar/i })).not.toBeInTheDocument()
  })

  it('esconde o estorno num pedido ainda não pago', async () => {
    await open(order({ status: 'pending' }))

    await screen.findByText(/Laura/)
    expect(screen.queryByRole('button', { name: /reembolsar/i })).not.toBeInTheDocument()
  })

  it('esconde o estorno num pedido já reembolsado', async () => {
    await open(order({ status: 'refunded' }))

    await screen.findByText(/Laura/)
    expect(screen.queryByRole('button', { name: /reembolsar/i })).not.toBeInTheDocument()
  })

  /** A charge made before the migration is still refundable, through Stripe. */
  it('ainda oferece estorno de cobrança anterior à migração', async () => {
    await open(
      order({ status: 'paid', pagarmeChargeId: null, stripePaymentIntentId: 'pi_old' })
    )

    expect(await screen.findByRole('button', { name: /reembolsar/i })).toBeInTheDocument()
  })
})

describe('OrderDetailModal — reconciliação', () => {
  it('mostra a cobrança da Pagar.me para procurar no painel dela', async () => {
    await open(order())

    expect(await screen.findByText('ch_abc123')).toBeInTheDocument()
    expect(screen.getByText(/Cobrança na Pagar\.me/i)).toBeInTheDocument()
  })

  it('identifica a cobrança antiga como Stripe, para não procurar no lugar errado', async () => {
    await open(order({ pagarmeChargeId: null, stripePaymentIntentId: 'pi_old' }))

    expect(await screen.findByText('pi_old')).toBeInTheDocument()
    expect(screen.getByText(/Stripe \(legado\)/i)).toBeInTheDocument()
  })

  it('não inventa uma linha de cobrança quando não existe', async () => {
    await open(order({ pagarmeChargeId: null, stripePaymentIntentId: null }))

    await screen.findByText(/Laura/)
    expect(screen.queryByText(/^Cobrança/i)).not.toBeInTheDocument()
  })

  /** The card that paid, so a statement line can be matched to an order. */
  it('mostra a bandeira, os quatro últimos dígitos e o parcelamento', async () => {
    await open(
      order({
        paymentMethod: 'credit_card',
        cardBrand: 'visa',
        cardLastFour: '4242',
        installments: 3,
      })
    )

    expect(await screen.findByText(/visa ···· 4242 · 3x/i)).toBeInTheDocument()
  })
})
