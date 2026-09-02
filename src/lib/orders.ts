import { api } from './api-client'
import type { DeliveryMethod, Order, OrderStatus, PixQRData } from '../types'
import type { CartItem } from '../types'

export interface ShippingAddressPayload {
  cep: string
  street: string
  number: string
  complement?: string
  neighborhood: string
  city: string
  state: string
  recipientName?: string
}

export interface CreateOrderPayload {
  items: { productId: string; quantity: number; variantId?: string }[]
  /** `document` is the buyer's CPF (CNPJ on the wholesale channel), digits only. */
  customer: { name: string; email: string; phone?: string; document: string }
  /** Free-form note to the shop, up to 500 characters. */
  customerNote?: string
  /** 'shipping' (default) goes via Correios; 'pickup' is store collection. */
  deliveryMethod?: DeliveryMethod
  /** Required when deliveryMethod is 'shipping'. */
  shippingAddress?: ShippingAddressPayload
  /** Required when deliveryMethod is 'shipping'. */
  shipping?: { quoteToken: string; serviceId: string }
  paymentMethod: 'pix' | 'credit_card'
  applyStoreCredit?: boolean
  channel?: 'retail' | 'wholesale'
  /** Competes with the member and site discounts; the largest one wins. */
  couponCode?: string
  cnpj?: string
}

export interface CreateOrderResult {
  order: Order
  pixData?: PixQRData
  /**
   * A card order comes back unpaid: Pagar.me authorises from a token in one
   * synchronous call, so there is nothing to prepare up front. Call
   * `payOrderWithCard` next. Keeping the two apart is what makes a declined
   * card a retry on the same order rather than a new one.
   */
  requiresCard?: boolean
}

export interface PayOrderResult {
  order: Order
  status: 'paid' | 'pending' | 'failed'
  chargeId: string
  installments: number
  cardBrand: string | null
  cardLastFour: string | null
}

/** Create an order + charge. Member 10% or wholesale 25% applied server-side by channel. */
export async function createOrder(payload: CreateOrderPayload): Promise<CreateOrderResult> {
  const result = await api.post<CreateOrderResult>('/orders', payload as unknown as Record<string, unknown>)
  if (result.error || !result.data) {
    throw new Error(result.error || 'Não foi possível criar o pedido.')
  }
  return result.data
}

/**
 * Authorise a card against an order that is waiting for one.
 *
 * `cardToken` is produced in the browser by `createCardToken()`, so no card
 * data passes through here. A decline arrives as a thrown error carrying the
 * bank's reason, already in PT-BR — the order stays payable for another try.
 */
export async function payOrderWithCard(
  orderId: string,
  cardToken: string,
  installments = 1
): Promise<PayOrderResult> {
  const result = await api.post<PayOrderResult>(`/orders/${orderId}/pay-card`, {
    card_token: cardToken,
    installments,
  })
  if (result.error || !result.data) {
    throw new Error(result.error || 'Não foi possível processar o cartão.')
  }
  return result.data
}

/** Helper: build the order payload from cart items. */
export function cartToOrderItems(
  items: CartItem[]
): { productId: string; quantity: number; variantId?: string }[] {
  return items.map((i) => ({
    productId: i.productId,
    quantity: i.quantity,
    ...(i.variantId ? { variantId: i.variantId } : {}),
  }))
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

export interface OrderPixInfo {
  orderNumber: number
  total: number
  pix: PixQRData
}

/**
 * The pending PIX of an order, by id — no login.
 *
 * The checkout screen held the EMV only in component state, and tapping
 * "Acompanhar pedido" unmounted it. This is how the order page gets the code
 * back, for a guest too. `null` = nothing left to pay (or already settled).
 */
export async function getOrderPix(id: string): Promise<OrderPixInfo | null> {
  const result = await api.get<OrderPixInfo>(`/orders/${id}/pix`, { skipAuth: true })
  return result.data ?? null
}

// ─── Admin ─────────────────────────────────────────────────────────────────

export interface OrderListResult {
  orders: Order[]
  total: number
  page: number
  limit: number
  /**
   * Purchases made as a guest with this account's e-mail that are waiting on
   * e-mail verification to be adopted. Only ever set by `/orders/me`.
   */
  unclaimedGuestOrders?: number
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

export async function setOrderTracking(
  id: string,
  trackingCode: string,
  trackingUrl?: string
): Promise<Order | null> {
  const result = await api.patch<Order>(`/orders/${id}/tracking`, {
    trackingCode,
    ...(trackingUrl ? { trackingUrl } : {}),
  })
  return result.data ?? null
}

/** Minhas compras (logged-in member). */
export async function listMyOrders(params: {
  tab?: string
  page?: number
  limit?: number
} = {}): Promise<OrderListResult> {
  const qs = new URLSearchParams()
  if (params.tab) qs.set('tab', params.tab)
  if (params.page) qs.set('page', String(params.page))
  if (params.limit) qs.set('limit', String(params.limit))
  const query = qs.toString()
  const result = await api.get<OrderListResult>(`/orders/me${query ? `?${query}` : ''}`)
  return result.data ?? { orders: [], total: 0, page: 1, limit: 20 }
}

export async function getMyOrder(id: string): Promise<Order | null> {
  const result = await api.get<Order>(`/orders/me/${id}`)
  return result.data ?? null
}

/**
 * Cancels the caller's own order. Only unpaid orders qualify; anything already
 * paid needs a refund, which stays with an admin. The server's message is
 * surfaced as-is so the customer reads the real reason.
 */
export async function cancelMyOrder(id: string): Promise<Order> {
  const result = await api.post<Order>(`/orders/me/${id}/cancel`)
  if (result.error || !result.data) {
    throw new Error(result.error || 'Não foi possível cancelar o pedido.')
  }
  return result.data
}
