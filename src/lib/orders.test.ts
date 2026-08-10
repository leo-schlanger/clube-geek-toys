import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}))

import { api } from './api-client'
import {
  createOrder,
  cartToOrderItems,
  getOrderStatus,
  adminListOrders,
  getOrder,
  updateOrderStatus,
  confirmPixOrder,
  refundOrder,
  setOrderTracking,
  listMyOrders,
  getMyOrder,
} from './orders'

const mockedApi = vi.mocked(api)

describe('orders API client', () => {
  beforeEach(() => vi.clearAllMocks())

  it('cartToOrderItems maps cart', () => {
    expect(
      cartToOrderItems([
        {
          productId: 'p1',
          name: 'X',
          slug: 'x',
          price: 10,
          image: null,
          quantity: 3,
          stock: 10,
        },
      ])
    ).toEqual([{ productId: 'p1', quantity: 3 }])
  })

  it('createOrder with wholesale channel', async () => {
    mockedApi.post.mockResolvedValue({
      data: { order: { id: 'o1', total: 75 }, pixData: { emvCode: 'x' } },
      status: 201,
    })
    const res = await createOrder({
      items: [{ productId: 'p1', quantity: 2 }],
      customer: { name: 'A', email: 'a@b.com' },
      shippingAddress: {
        cep: '22011001',
        street: 'Rua',
        number: '1',
        neighborhood: 'Cop',
        city: 'RJ',
        state: 'RJ',
      },
      shipping: { quoteToken: 'token-long', serviceId: '1' },
      paymentMethod: 'pix',
      channel: 'wholesale',
      cnpj: '11222333000181',
    })
    expect(mockedApi.post).toHaveBeenCalledWith(
      '/orders',
      expect.objectContaining({ channel: 'wholesale' })
    )
    expect(res.order.id).toBe('o1')
  })

  it('createOrder throws on error', async () => {
    mockedApi.post.mockResolvedValue({ error: 'falha', status: 400 })
    await expect(
      createOrder({
        items: [{ productId: 'p1', quantity: 1 }],
        customer: { name: 'A', email: 'a@b.com' },
        shippingAddress: {
          cep: '22011001',
          street: 'R',
          number: '1',
          neighborhood: 'N',
          city: 'C',
          state: 'RJ',
        },
        shipping: { quoteToken: 'tokentoken', serviceId: '1' },
        paymentMethod: 'pix',
      })
    ).rejects.toThrow(/falha|pedido/i)
  })

  it('getOrderStatus', async () => {
    mockedApi.get.mockResolvedValue({
      data: { id: 'o1', status: 'paid', orderNumber: 1 },
      status: 200,
    })
    expect(await getOrderStatus('o1')).toMatchObject({ status: 'paid' })
  })

  it('adminListOrders and getOrder', async () => {
    mockedApi.get
      .mockResolvedValueOnce({
        data: { orders: [], total: 0, page: 1, limit: 20 },
        status: 200,
      })
      .mockResolvedValueOnce({ data: { id: 'o1' }, status: 200 })
    expect(await adminListOrders({ status: 'paid' })).toMatchObject({ total: 0 })
    expect(await getOrder('o1')).toMatchObject({ id: 'o1' })
  })

  it('update status, confirm pix, refund, tracking', async () => {
    mockedApi.patch
      .mockResolvedValueOnce({ data: { id: 'o1', status: 'shipped' }, status: 200 })
      .mockResolvedValueOnce({ data: { id: 'o1', trackingCode: 'BR1' }, status: 200 })
    mockedApi.post
      .mockResolvedValueOnce({ data: { id: 'o1', status: 'paid' }, status: 200 })
      .mockResolvedValueOnce({ status: 200 })
    expect(await updateOrderStatus('o1', 'shipped')).toMatchObject({ status: 'shipped' })
    expect(await confirmPixOrder('o1')).toMatchObject({ status: 'paid' })
    expect(await refundOrder('o1')).toBe(true)
    expect(await setOrderTracking('o1', 'BR1', 'https://x')).toMatchObject({
      trackingCode: 'BR1',
    })
  })

  it('listMyOrders and getMyOrder', async () => {
    mockedApi.get
      .mockResolvedValueOnce({
        data: { orders: [], total: 0, page: 1, limit: 20 },
        status: 200,
      })
      .mockResolvedValueOnce({ data: { id: 'o1' }, status: 200 })
    expect(await listMyOrders({ tab: 'to_pay' })).toMatchObject({ total: 0 })
    expect(await getMyOrder('o1')).toMatchObject({ id: 'o1' })
  })
})
