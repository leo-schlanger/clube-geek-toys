import { where, orderBy, limit, type DocumentData } from 'firebase/firestore'
import { FirestoreManager, MapperUtils } from './db-utils'
import { paymentLogger } from './logger'
import { COLLECTIONS } from './constants'
import { PLANS } from '../types'
import type {
  Subscription,
  SubscriptionPayment,
  SubscriptionStatus,
  SubscriptionFrequencyType,
  PlanType,
  CreateSubscriptionRequest,
} from '../types'

// ============================================
// CONFIGURATION
// ============================================

const SUBSCRIPTIONS_COLLECTION = COLLECTIONS.SUBSCRIPTIONS
const SUBSCRIPTION_PAYMENTS_COLLECTION = COLLECTIONS.SUBSCRIPTION_PAYMENTS
const PAYMENT_API_URL = import.meta.env.VITE_PAYMENT_API_URL || ''

// Request configuration
const DEFAULT_TIMEOUT = 15000
const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY = 1000

// ============================================
// FETCH HELPERS
// ============================================

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout: number = DEFAULT_TIMEOUT
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries: number = MAX_RETRIES,
  timeout: number = DEFAULT_TIMEOUT
): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, timeout)

      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response
      }

      lastError = new Error(`Server error: ${response.status}`)
    } catch (error) {
      lastError = error as Error

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`)
      }
    }

    if (attempt < maxRetries - 1) {
      const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError || new Error('Request failed after retries')
}

// ============================================
// FIRESTORE MAPPERS
// ============================================

function toSubscription(id: string, data: DocumentData): Subscription {
  const mapped = MapperUtils.toCamel(data)
  return {
    id,
    memberId: mapped.memberId,
    mercadoPagoId: mapped.mercadoPagoId,
    status: mapped.status,
    plan: mapped.plan,
    frequencyType: mapped.frequencyType,
    transactionAmount: mapped.transactionAmount,
    nextPaymentDate: mapped.nextPaymentDate,
    lastPaymentDate: mapped.lastPaymentDate,
    failedPayments: mapped.failedPayments || 0,
    cardLastFour: mapped.cardLastFour,
    cardBrand: mapped.cardBrand,
    payerEmail: mapped.payerEmail,
    createdAt: mapped.createdAt,
    cancelledAt: mapped.cancelledAt,
    pausedAt: mapped.pausedAt,
  }
}

function toSubscriptionPayment(id: string, data: DocumentData): SubscriptionPayment {
  const mapped = MapperUtils.toCamel(data)
  return {
    id,
    subscriptionId: mapped.subscriptionId,
    memberId: mapped.memberId,
    amount: mapped.amount,
    status: mapped.status,
    paymentDate: mapped.paymentDate,
    mercadoPagoPaymentId: mapped.mercadoPagoPaymentId,
    failureReason: mapped.failureReason,
  }
}

// ============================================
// PRICE CALCULATIONS
// ============================================

/**
 * Calculate subscription price based on plan and frequency
 */
export function calculateSubscriptionPrice(
  plan: PlanType,
  frequencyType: SubscriptionFrequencyType
): number {
  const planData = PLANS[plan]
  return frequencyType === 'months' ? planData.priceMonthly : planData.priceAnnual
}

// ============================================
// API CALLS
// ============================================

export interface CreateSubscriptionResponse {
  id: string
  status: SubscriptionStatus
  initPoint?: string // URL to complete card registration if needed
}

/**
 * Create a new subscription via API
 */
export async function createSubscription(
  request: CreateSubscriptionRequest
): Promise<CreateSubscriptionResponse | null> {
  if (!PAYMENT_API_URL) {
    paymentLogger.error('Payment API URL not configured')
    return null
  }

  try {
    const amount = calculateSubscriptionPrice(request.plan, request.frequencyType)
    const planData = PLANS[request.plan]

    const response = await fetchWithRetry(`${PAYMENT_API_URL}/subscription/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        member_id: request.memberId,
        plan: request.plan,
        frequency_type: request.frequencyType,
        payer_email: request.payerEmail,
        card_token: request.cardToken,
        transaction_amount: amount,
        reason: `Clube Geek & Toys - Plano ${planData.name}`,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      paymentLogger.error('Failed to create subscription:', errorData)
      return null
    }

    const data = await response.json()
    return {
      id: data.id,
      status: data.status,
      initPoint: data.init_point,
    }
  } catch (error) {
    paymentLogger.error('Error creating subscription:', error)
    return null
  }
}

/**
 * Get subscription details from API
 */
export async function getSubscriptionFromApi(subscriptionId: string): Promise<Subscription | null> {
  if (!PAYMENT_API_URL) {
    paymentLogger.error('Payment API URL not configured')
    return null
  }

  try {
    const response = await fetchWithRetry(`${PAYMENT_API_URL}/subscription/${subscriptionId}`)

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    return {
      id: data.id,
      memberId: data.member_id,
      mercadoPagoId: data.mercado_pago_id,
      status: data.status,
      plan: data.plan,
      frequencyType: data.frequency_type,
      transactionAmount: data.transaction_amount,
      nextPaymentDate: data.next_payment_date,
      lastPaymentDate: data.last_payment_date,
      failedPayments: data.failed_payments || 0,
      cardLastFour: data.card_last_four,
      cardBrand: data.card_brand,
      payerEmail: data.payer_email,
      createdAt: data.created_at,
      cancelledAt: data.cancelled_at,
      pausedAt: data.paused_at,
    }
  } catch (error) {
    paymentLogger.error('Error fetching subscription:', error)
    return null
  }
}

/**
 * Pause a subscription
 */
export async function pauseSubscription(subscriptionId: string): Promise<boolean> {
  if (!PAYMENT_API_URL) {
    paymentLogger.error('Payment API URL not configured')
    return false
  }

  try {
    const response = await fetchWithRetry(
      `${PAYMENT_API_URL}/subscription/${subscriptionId}/pause`,
      { method: 'PUT' }
    )

    return response.ok
  } catch (error) {
    paymentLogger.error('Error pausing subscription:', error)
    return false
  }
}

/**
 * Resume a paused subscription
 */
export async function resumeSubscription(subscriptionId: string): Promise<boolean> {
  if (!PAYMENT_API_URL) {
    paymentLogger.error('Payment API URL not configured')
    return false
  }

  try {
    const response = await fetchWithRetry(
      `${PAYMENT_API_URL}/subscription/${subscriptionId}/resume`,
      { method: 'PUT' }
    )

    return response.ok
  } catch (error) {
    paymentLogger.error('Error resuming subscription:', error)
    return false
  }
}

/**
 * Cancel a subscription
 */
export async function cancelSubscription(subscriptionId: string): Promise<boolean> {
  if (!PAYMENT_API_URL) {
    paymentLogger.error('Payment API URL not configured')
    return false
  }

  try {
    const response = await fetchWithRetry(
      `${PAYMENT_API_URL}/subscription/${subscriptionId}/cancel`,
      { method: 'PUT' }
    )

    return response.ok
  } catch (error) {
    paymentLogger.error('Error cancelling subscription:', error)
    return false
  }
}

/**
 * Update subscription card
 */
export async function updateSubscriptionCard(
  subscriptionId: string,
  cardToken: string
): Promise<boolean> {
  if (!PAYMENT_API_URL) {
    paymentLogger.error('Payment API URL not configured')
    return false
  }

  try {
    const response = await fetchWithRetry(
      `${PAYMENT_API_URL}/subscription/${subscriptionId}/update-card`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_token: cardToken }),
      }
    )

    return response.ok
  } catch (error) {
    paymentLogger.error('Error updating subscription card:', error)
    return false
  }
}

// ============================================
// FIRESTORE QUERIES
// ============================================

/**
 * Get subscription by ID from Firestore
 */
export async function getSubscriptionById(subscriptionId: string): Promise<Subscription | null> {
  return FirestoreManager.getById(SUBSCRIPTIONS_COLLECTION, subscriptionId, toSubscription)
}

/**
 * Get subscription by member ID
 */
export async function getSubscriptionByMemberId(memberId: string): Promise<Subscription | null> {
  const subscriptions = await FirestoreManager.findMany(
    SUBSCRIPTIONS_COLLECTION,
    [where('member_id', '==', memberId), orderBy('created_at', 'desc')],
    toSubscription
  )
  return subscriptions.length > 0 ? subscriptions[0] : null
}

/**
 * Get active subscription by member ID
 */
export async function getActiveSubscriptionByMemberId(memberId: string): Promise<Subscription | null> {
  const subscriptions = await FirestoreManager.findMany(
    SUBSCRIPTIONS_COLLECTION,
    [
      where('member_id', '==', memberId),
      where('status', 'in', ['authorized', 'paused']),
    ],
    toSubscription
  )
  return subscriptions.length > 0 ? subscriptions[0] : null
}

/**
 * Get subscription payment history
 */
export async function getSubscriptionPayments(
  subscriptionId: string,
  limitCount = 20
): Promise<SubscriptionPayment[]> {
  return FirestoreManager.findMany(
    SUBSCRIPTION_PAYMENTS_COLLECTION,
    [
      where('subscription_id', '==', subscriptionId),
      orderBy('payment_date', 'desc'),
      limit(limitCount),
    ],
    toSubscriptionPayment
  )
}

/**
 * Get member payment history (all subscriptions)
 */
export async function getMemberSubscriptionPayments(
  memberId: string,
  limitCount = 20
): Promise<SubscriptionPayment[]> {
  return FirestoreManager.findMany(
    SUBSCRIPTION_PAYMENTS_COLLECTION,
    [
      where('member_id', '==', memberId),
      orderBy('payment_date', 'desc'),
      limit(limitCount),
    ],
    toSubscriptionPayment
  )
}

// ============================================
// STATUS HELPERS
// ============================================

/**
 * Get human-readable subscription status label
 */
export function getSubscriptionStatusLabel(status: SubscriptionStatus): string {
  const labels: Record<SubscriptionStatus, string> = {
    pending: 'Pendente',
    authorized: 'Ativa',
    paused: 'Pausada',
    cancelled: 'Cancelada',
  }
  return labels[status] || status
}

/**
 * Get status color class
 */
export function getSubscriptionStatusColor(status: SubscriptionStatus): string {
  const colors: Record<SubscriptionStatus, string> = {
    pending: 'text-yellow-500',
    authorized: 'text-green-500',
    paused: 'text-orange-500',
    cancelled: 'text-red-500',
  }
  return colors[status] || 'text-gray-500'
}

/**
 * Get status badge variant
 */
export function getSubscriptionStatusBadge(status: SubscriptionStatus): 'success' | 'warning' | 'destructive' | 'default' {
  const variants: Record<SubscriptionStatus, 'success' | 'warning' | 'destructive' | 'default'> = {
    pending: 'warning',
    authorized: 'success',
    paused: 'warning',
    cancelled: 'destructive',
  }
  return variants[status] || 'default'
}

/**
 * Get frequency label
 */
export function getFrequencyLabel(frequencyType: SubscriptionFrequencyType): string {
  return frequencyType === 'months' ? 'Mensal' : 'Anual'
}

/**
 * Check if subscription allows actions
 */
export function canPauseSubscription(subscription: Subscription): boolean {
  return subscription.status === 'authorized'
}

export function canResumeSubscription(subscription: Subscription): boolean {
  return subscription.status === 'paused'
}

export function canCancelSubscription(subscription: Subscription): boolean {
  return subscription.status === 'authorized' || subscription.status === 'paused'
}

export function canUpdateCard(subscription: Subscription): boolean {
  return subscription.status === 'authorized' || subscription.status === 'paused'
}

/**
 * Format card display (brand + last 4 digits)
 */
export function formatCardDisplay(subscription: Subscription): string {
  if (!subscription.cardLastFour) return 'Cartão não registrado'
  const brand = subscription.cardBrand || 'Cartão'
  return `${brand} **** ${subscription.cardLastFour}`
}

/**
 * Format next payment date
 */
export function formatNextPaymentDate(subscription: Subscription): string {
  if (!subscription.nextPaymentDate) return 'Não definida'
  return new Date(subscription.nextPaymentDate).toLocaleDateString('pt-BR')
}
