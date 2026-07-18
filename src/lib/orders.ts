import { api } from './api-client'
import type { Order, OrderStatus, PixQRData } from '../types'
import type { CartItem } from '../types'

export interface CreateOrderPayload {
  items: { productId: string; quantity: number }[]
  customer: { name: string; email: string; phone?: string }
  shippingAddress?: Record<string, unknown>
  paymentMethod: 'pix' | 'credit_card'
}

export interface CreateOrderResult {
  order: Order
  clientSecret?: string
  pixData?: PixQRData
}

/** Create an order + charge. The 15% member discount is applied server-side. */
export async function createOrder(payload: CreateOrderPayload): Promise<CreateOrderResult> {
  const result = await api.post<CreateOrderResult>('/orders', payload as unknown as Record<string, unknown>)
  if (result.error || !result.data) {
    throw new Error(result.error || 'Não foi possível criar o pedido.')
  }
  return result.data
}

/** Helper: build the order payload from cart items. */
export function cartToOrderItems(items: CartItem[]): { productId: string; quantity: number }[] {
  return items.map((i) => ({ productId: i.productId, quantity: i.quantity }))
}

export interface OrderStatusInfo {
  id: string
  status: OrderStatus
  orderNumber: number
}

/** Public: poll an order's status (used on the confirmation page). */
export async function getOrderStatus(id: string): Promise<OrderStatusInfo | null> {
  const result = await api.get<OrderStatusInfo>(`/orders/${id}/status`, { skipAuth: true })
  return result.data ?? null
}

// ─── Admin ─────────────────────────────────────────────────────────────────

export interface OrderListResult {
  orders: Order[]
  total: number
  page: number
  limit: number
}

export async function adminListOrders(params: { status?: string; page?: number; limit?: number } = {}): Promise<OrderListResult> {
  const qs = new URLSearchParams()
  if (params.status) qs.set('status', params.status)
  if (params.page) qs.set('page', String(params.page))
  if (params.limit) qs.set('limit', String(params.limit))
  const query = qs.toString()
  const result = await api.get<OrderListResult>(`/orders${query ? `?${query}` : ''}`)
  return result.data ?? { orders: [], total: 0, page: 1, limit: 20 }
}

export async function getOrder(id: string): Promise<Order | null> {
  const result = await api.get<Order>(`/orders/${id}`)
  return result.data ?? null
}

export async function updateOrderStatus(id: string, status: OrderStatus): Promise<Order | null> {
  const result = await api.patch<Order>(`/orders/${id}/status`, { status })
  return result.data ?? null
}

export async function confirmPixOrder(id: string): Promise<Order | null> {
  const result = await api.post<Order>(`/orders/${id}/confirm-pix`)
  return result.data ?? null
}

export async function refundOrder(id: string): Promise<boolean> {
  const result = await api.post(`/orders/${id}/refund`)
  return !result.error
}
