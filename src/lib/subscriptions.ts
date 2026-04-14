import { api } from './api-client'
import { paymentLogger } from './logger'
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
      encrypted_card: request.encryptedCard,
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
  cardToken: string
): Promise<boolean> {
  try {
    const result = await api.put(`/subscription/${subscriptionId}/update-card`, { encrypted_card: cardToken })
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
 * Get subscription by member ID
 */
export async function getSubscriptionByMemberId(_memberId: string): Promise<Subscription | null> {
  // Use the member's subscription_id from their profile
  return null // Will be fetched via member data
}

/**
 * Get active subscription by member ID
 */
export async function getActiveSubscriptionByMemberId(_memberId: string): Promise<Subscription | null> {
  // Fetch member first to get subscription_id, then fetch subscription
  return null // Will be fetched via member data
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
 * Get member payment history (all subscriptions)
 */
export async function getMemberSubscriptionPayments(
  _memberId: string,
  _limitCount = 20
): Promise<SubscriptionPayment[]> {
  return []
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
