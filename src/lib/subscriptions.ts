import { api } from './api-client'
import { paymentLogger } from './logger'
import { CLUB_PLAN } from '../types'
import type {
  Subscription,
  SubscriptionPayment,
  SubscriptionStatus,
  SubscriptionFrequencyType,
  PlanType,
  CreateSubscriptionRequest,
} from '../types'

// ============================================
// PRICE CALCULATIONS
// ============================================

/**
 * Calculate subscription price based on plan and frequency
 */
export function calculateSubscriptionPrice(
  _plan: PlanType,
  _frequencyType: SubscriptionFrequencyType
): number {
  // Plano único e anual: preço fixo do clube.
  return CLUB_PLAN.price
}

// ============================================
// API CALLS
// ============================================

export interface CreateSubscriptionResponse {
  id: string
  status: SubscriptionStatus
  initPoint?: string
}

/**
 * Create a new subscription via API
 */
export async function createSubscription(
  request: CreateSubscriptionRequest
): Promise<CreateSubscriptionResponse | null> {
  try {
    const amount = calculateSubscriptionPrice(request.plan, request.frequencyType)

    const result = await api.post('/subscription/create', {
      member_id: request.memberId,
      plan: request.plan,
      frequency_type: request.frequencyType,
      payer_email: request.payerEmail,
      payer_name: request.payerName || 'Cliente',
      transaction_amount: amount,
    })

    if (result.error || !result.data) {
      paymentLogger.error('Failed to create subscription:', result.error || 'empty response')
      return null
    }

    return {
      id: result.data.id,
      status: result.data.status,
      initPoint: result.data.init_point,
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
  try {
    const result = await api.get<Subscription>(`/subscription/${subscriptionId}`)
    return result.data || null
  } catch (error) {
    paymentLogger.error('Error fetching subscription:', error)
    return null
  }
}

/**
 * Pause a subscription
 */
export async function pauseSubscription(subscriptionId: string): Promise<boolean> {
  try {
    const result = await api.put(`/subscription/${subscriptionId}/pause`)
    return !result.error
  } catch (error) {
    paymentLogger.error('Error pausing subscription:', error)
    return false
  }
}

/**
 * Resume a paused subscription
 */
export async function resumeSubscription(subscriptionId: string): Promise<boolean> {
  try {
    const result = await api.put(`/subscription/${subscriptionId}/resume`)
    return !result.error
  } catch (error) {
    paymentLogger.error('Error resuming subscription:', error)
    return false
  }
}

/**
 * Cancel a subscription
 */
export async function cancelSubscription(subscriptionId: string): Promise<boolean> {
  try {
    const result = await api.put(`/subscription/${subscriptionId}/cancel`)
    return !result.error
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
  paymentMethodId: string
): Promise<boolean> {
  try {
    const result = await api.put(`/subscription/${subscriptionId}/update-payment-method`, { paymentMethodId })
    return !result.error
  } catch (error) {
    paymentLogger.error('Error updating subscription card:', error)
    return false
  }
}

// ============================================
// API QUERIES
// ============================================

/**
 * Get subscription by ID
 */
export async function getSubscriptionById(subscriptionId: string): Promise<Subscription | null> {
  return getSubscriptionFromApi(subscriptionId)
}

/**
 * Get subscription by member ID.
 * Fetches member profile first to get subscriptionId, then fetches subscription.
 */
export async function getSubscriptionByMemberId(memberId: string): Promise<Subscription | null> {
  try {
    const memberResult = await api.get<{ subscriptionId?: string }>(`/members/${memberId}`)
    const subId = memberResult.data?.subscriptionId
    if (!subId) return null
    return getSubscriptionFromApi(subId)
  } catch {
    return null
  }
}

/**
 * Get active subscription by member ID.
 * Returns subscription only if status is 'authorized' or 'pending'.
 */
export async function getActiveSubscriptionByMemberId(memberId: string): Promise<Subscription | null> {
  const sub = await getSubscriptionByMemberId(memberId)
  if (!sub) return null
  if (sub.status === 'authorized' || sub.status === 'pending') return sub
  return null
}

/**
 * Get subscription payment history
 */
export async function getSubscriptionPayments(
  subscriptionId: string,
  _limitCount = 20
): Promise<SubscriptionPayment[]> {
  try {
    const result = await api.get<SubscriptionPayment[]>(`/subscription/${subscriptionId}/payments?limit=${_limitCount}`)
    return result.data || []
  } catch {
    return []
  }
}

/**
 * Get member payment history (all subscriptions).
 * Fetches member's subscription, then gets payment history.
 */
export async function getMemberSubscriptionPayments(
  memberId: string,
  limitCount = 20
): Promise<SubscriptionPayment[]> {
  const sub = await getSubscriptionByMemberId(memberId)
  if (!sub) return []
  return getSubscriptionPayments(sub.id, limitCount)
}

// ============================================
// STATUS HELPERS
// ============================================

export function getSubscriptionStatusLabel(status: SubscriptionStatus): string {
  const labels: Record<SubscriptionStatus, string> = {
    pending: 'Pendente',
    authorized: 'Ativa',
    paused: 'Pausada',
    cancelled: 'Cancelada',
  }
  return labels[status] || status
}

export function getSubscriptionStatusColor(status: SubscriptionStatus): string {
  const colors: Record<SubscriptionStatus, string> = {
    pending: 'text-yellow-500',
    authorized: 'text-green-500',
    paused: 'text-orange-500',
    cancelled: 'text-red-500',
  }
  return colors[status] || 'text-gray-500'
}

export function getSubscriptionStatusBadge(status: SubscriptionStatus): 'success' | 'warning' | 'destructive' | 'default' {
  const variants: Record<SubscriptionStatus, 'success' | 'warning' | 'destructive' | 'default'> = {
    pending: 'warning',
    authorized: 'success',
    paused: 'warning',
    cancelled: 'destructive',
  }
  return variants[status] || 'default'
}

export function getFrequencyLabel(frequencyType: SubscriptionFrequencyType): string {
  return frequencyType === 'months' ? 'Mensal' : 'Anual'
}

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

export function formatCardDisplay(subscription: Subscription): string {
  if (!subscription.cardLastFour) return 'Cartão não registrado'
  const brand = subscription.cardBrand || 'Cartão'
  return `${brand} **** ${subscription.cardLastFour}`
}

export function formatNextPaymentDate(subscription: Subscription): string {
  if (!subscription.nextPaymentDate) return 'Não definida'
  return new Date(subscription.nextPaymentDate).toLocaleDateString('pt-BR')
}
