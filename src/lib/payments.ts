/**
 * Payment API client — Stripe integration.
 *
 * Calls our backend which creates Stripe PaymentIntents.
 * The backend returns a `clientSecret` that the frontend uses with Stripe.js
 * to complete the payment (card, PIX, etc) directly with Stripe.
 */

import { api, API_URL } from './api-client'
import { paymentLogger } from './logger'
import { isStripeConfigured } from './stripe'
import type { Payment, PaymentStatus, PlanType, PaymentType } from '../types'
import { PLANS } from '../types'

// ============================================
// CONFIGURATION
// ============================================

export function isPaymentConfigured(): boolean {
  return Boolean(API_URL) && isStripeConfigured()
}

// ============================================
// CALCULATIONS
// ============================================

export function calculatePlanPrice(plan: PlanType, paymentType: PaymentType): number {
  const planData = PLANS[plan]
  return paymentType === 'monthly' ? planData.priceMonthly : planData.priceAnnual
}

// ============================================
// API CRUD
// ============================================

export async function getMemberPayments(memberId: string): Promise<Payment[]> {
  try {
    const result = await api.get<Payment[]>(`/payments?member_id=${memberId}&limit=50`)
    return result.data || []
  } catch {
    return []
  }
}

// ============================================
// STRIPE — PIX PAYMENT
// ============================================

export interface PixPaymentData {
  paymentIntentId: string
  clientSecret: string
  qrCode: string
  qrCodeBase64: string
  qrCodeImageUrl: string
  pixKey: string
  expiresAt: string
  amount: number
}

/**
 * Create a PIX payment (generated locally by the backend, not via Stripe).
 * Returns EMV code for QR rendering + payment ID.
 * Admin confirms manually → member gets activated.
 */
export async function generatePixPayment(
  amount: number,
  description: string,
  payerEmail: string,
  memberId: string
): Promise<PixPaymentData | null> {
  if (!memberId || memberId.trim() === '') {
    paymentLogger.error('Cannot create PIX payment: memberId is required')
    return null
  }

  try {
    const result = await api.post<{
      paymentId: string
      pixData: {
        emvCode: string
        pixKey: string
        amount: number
        txId: string
        expiresAt: string
      }
    }>('/pix/create', {
      amount,
      description,
      payer_email: payerEmail,
      external_reference: memberId,
    })

    if (result.error) {
      const err = new Error(result.error) as Error & { code?: string }
      err.code = result.code
      throw err
    }

    if (!result.data) {
      throw new Error('Resposta inválida do servidor ao criar pagamento PIX')
    }
    const data = result.data
    return {
      paymentIntentId: data.paymentId,
      clientSecret: '', // PIX doesn't use Stripe clientSecret
      qrCode: data.pixData.emvCode,
      qrCodeBase64: '',
      qrCodeImageUrl: '',
      pixKey: data.pixData.pixKey,
      expiresAt: data.pixData.expiresAt,
      amount: data.pixData.amount,
    }
  } catch (error) {
    paymentLogger.error('Error creating PIX payment:', error)
    throw error
  }
}

// ============================================
// STRIPE — CARD PAYMENT
// ============================================

export interface CardPaymentData {
  paymentIntentId: string
  clientSecret: string
  status: PaymentStatus
}

/**
 * Create a Stripe PaymentIntent for card.
 * Returns clientSecret — frontend uses Stripe Elements to collect card and confirm.
 */
export async function createCardPayment(
  plan: PlanType,
  paymentType: PaymentType,
  payerEmail: string,
  payerName: string,
  memberId: string,
): Promise<CardPaymentData | null> {
  const amount = calculatePlanPrice(plan, paymentType)
  const planName = PLANS[plan].name

  try {
    const result = await api.post<{
      clientSecret: string
      paymentIntentId: string
      status?: string
    }>('/checkout/card/create', {
      amount,
      description: `Clube Geek & Toys - Plano ${planName}`,
      payer_email: payerEmail,
      payer_name: payerName,
      external_reference: memberId,
    })

    if (result.error) {
      const err = new Error(result.error) as Error & { code?: string }
      err.code = result.code
      throw err
    }

    if (!result.data) {
      throw new Error('Resposta inválida do servidor ao criar pagamento com cartão')
    }
    const data = result.data
    return {
      paymentIntentId: data.paymentIntentId,
      clientSecret: data.clientSecret,
      status: (data.status as PaymentStatus) || 'pending',
    }
  } catch (error) {
    paymentLogger.error('Error creating card payment:', error)
    throw error
  }
}

// ============================================
// PAYMENT STATUS CHECK
// ============================================

export async function checkPaymentStatus(paymentIntentId: string): Promise<PaymentStatus> {
  try {
    const result = await api.get<{ mapped_status: PaymentStatus }>(`/payment/status/${paymentIntentId}`)
    return result.data?.mapped_status || 'pending'
  } catch {
    return 'pending'
  }
}

export async function checkPixPaymentStatus(paymentId: string): Promise<PaymentStatus> {
  return checkPaymentStatus(paymentId)
}

// ============================================
// SUBSCRIPTION
// ============================================

export interface SubscriptionPaymentData {
  subscriptionId: string
  clientSecret: string
  status: string
}

export async function createSubscriptionPayment(
  plan: PlanType,
  paymentType: PaymentType,
  payerEmail: string,
  payerName: string,
  memberId: string,
): Promise<SubscriptionPaymentData | null> {
  const amount = calculatePlanPrice(plan, paymentType)

  try {
    const result = await api.post<{
      id: string
      clientSecret: string
      status: string
    }>('/subscription/create', {
      member_id: memberId,
      plan,
      frequency_type: paymentType === 'monthly' ? 'months' : 'years',
      payer_email: payerEmail,
      payer_name: payerName,
      transaction_amount: amount,
    })

    if (result.error || !result.data) {
      throw new Error(result.error || 'Resposta inválida do servidor ao criar assinatura')
    }

    const data = result.data
    return {
      subscriptionId: data.id,
      clientSecret: data.clientSecret,
      status: data.status,
    }
  } catch (error) {
    paymentLogger.error('Error creating subscription:', error)
    throw error
  }
}

