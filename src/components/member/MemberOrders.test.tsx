import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Order } from '../../types'

const listMyOrders = vi.fn()
const getMyOrder = vi.fn()
vi.mock('../../lib/orders', () => ({
  listMyOrders: (...a: unknown[]) => listMyOrders(...a),
  getMyOrder: (...a: unknown[]) => getMyOrder(...a),
}))

import { MemberOrders } from './MemberOrders'
import { memberSavings } from '../../lib/member-card-state'

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 'o1', orderNumber: 128, memberId: 'm', customerName: 'Ana', customerEmail: 'a@example.com', customerPhone: null,
    shippingAddress: null, subtotal: 150, discount: 15, discountReason: 'member_10', shippingCost: 0, total: 135,
    status: 'shipped', paymentMethod: 'pix', stripePaymentIntentId: null, pixTxid: null, paidAt: null,
    createdAt: '2026-11-05T15:00:00Z', updatedAt: '2026-11-05T15:00:00Z',
    items: [
      { id: 'i1', orderId: 'o1', productId: 'p', productName: 'Photocard', productSlug: 'pc', unitPrice: 75, quantity: 2, lineTotal: 150, imageUrl: null },
    ],
    ...overrides,
  }
}

function renderOrders() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemberOrders />
    </QueryClientProvider>
  )
}

describe('MemberOrders', () => {
  beforeEach(() => {
    listMyOrders.mockReset()
    getMyOrder.mockReset()
  })

  it('counts only the membership discount as savings', () => {
    expect(memberSavings({ discount: 15, discountReason: 'member_10' })).toBe(15)
    expect(memberSavings({ discount: 15, discountReason: 'coupon:GEEK' })).toBe(0)
    expect(memberSavings({ discount: 0, discountReason: 'member_10' })).toBe(0)
  })

  it('lists the latest orders with date, items, savings and status, and opens the detail in the club', async () => {
    listMyOrders.mockResolvedValue({ orders: [order()], total: 1, page: 1, limit: 3 })
    getMyOrder.mockResolvedValue(order())
    renderOrders()
    expect(await screen.findByText('Pedido #128')).toBeInTheDocument()
    expect(screen.getByText('05/11 · 2 itens · economizou R$ 15,00')).toBeInTheDocument()
    expect(screen.getByText('Enviado')).toBeInTheDocument()
    expect(listMyOrders).toHaveBeenCalledWith({ limit: 3 })

    fireEvent.click(screen.getByText('Pedido #128'))
    expect(await screen.findByText('Desconto de membro')).toBeInTheDocument()
    expect(getMyOrder).toHaveBeenCalledWith('o1')
  })

  it('empty: one dashed line and a link to the shop', async () => {
    listMyOrders.mockResolvedValue({ orders: [], total: 0, page: 1, limit: 3 })
    renderOrders()
    expect(await screen.findByText(/Nenhuma compra ainda/)).toBeInTheDocument()
    expect(screen.getByText('Ver a loja')).toBeInTheDocument()
  })

  it('error: says so inside the card and retries', async () => {
    listMyOrders.mockRejectedValueOnce(new Error('x')).mockResolvedValue({ orders: [], total: 0, page: 1, limit: 3 })
    renderOrders()
    fireEvent.click(await screen.findByRole('button', { name: /Tentar de novo/ }))
    expect(await screen.findByText(/Nenhuma compra ainda/)).toBeInTheDocument()
  })

  it('tells about guest purchases waiting for e-mail confirmation', async () => {
    listMyOrders.mockResolvedValue({ orders: [], total: 0, page: 1, limit: 3, unclaimedGuestOrders: 2 })
    renderOrders()
    expect(await screen.findByText(/Há 2 compras como visitante/)).toBeInTheDocument()
  })
})
