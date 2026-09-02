/**
 * Payment API client — Pagar.me.
 *
 * Two shapes, and the difference matters:
 *
 *  - **PIX** returns a QR issued by Pagar.me. It is dynamic: the provider
 *    reconciles the transfer and settles the payment through the webhook, so
 *    the member is activated on their own. The old static BR Code waited for an
 *    admin to read the bank statement.
 *  - **Card** is authorised synchronously from a token the browser made against
 *    Pagar.me with the public key. There is no `clientSecret` to redeem any
 *    more — the call returns the outcome.
 */

import { api, API_URL } from './api-client'
import { paymentLogger } from './logger'
import { getPaymentConfig } from './pagarme'
import type { Payment, PaymentStatus, PlanType, PaymentType } from '../types'
import { CLUB_PLAN, PLANS } from '../types'

// ============================================
// CONFIGURATION
// ============================================

/**
 * Is there an API to talk to at all?
 *
 * Whether the *provider* is configured is a server fact now, answered by
 * `getPaymentConfig()` — a key rotated on the VPS must not need a frontend
 * deploy to take effect.
 */
export function isPaymentConfigured(): boolean {
  return Boolean(API_URL)
}

/** Whether card payment can actually be offered right now. */
export async function isCardPaymentAvailable(): Promise<boolean> {
  const config = await getPaymentConfig()
  return config.configured
}

// ============================================
// CALCULATIONS
// ============================================

export function calculatePlanPrice(_plan: PlanType, _paymentType: PaymentType): number {
  return CLUB_PLAN.price
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
// PIX
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
 * Create a PIX payment.
 *
 * The QR comes from Pagar.me and settles itself: their webhook marks the
 * charge paid and activates the member, usually within seconds of the transfer.
 * `checkPixPaymentStatus` also asks the provider directly, so the screen flips
 * without waiting on the webhook.
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
        /** Hosted PNG of the same code, when the provider issues one. */
        qrCodeUrl?: string
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
      clientSecret: '', // nothing to redeem: the QR is already payable
      qrCode: data.pixData.emvCode,
      qrCodeBase64: '',
      qrCodeImageUrl: data.pixData.qrCodeUrl ?? '',
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
// CARD
// ============================================

export interface CardPaymentData {
  paymentId: string
  chargeId: string
  status: PaymentStatus
  installments: number
  cardBrand: string | null
  cardLastFour: string | null
}

/**
 * Charge a card for the club plan.
 *
 * `cardToken` comes from `createCardToken()` — the browser made it against
 * Pagar.me with the public key, so no card data passes through here. The call
 * is synchronous: it resolves with the outcome, or throws a 402 carrying the
 * bank's reason already translated. There is no clientSecret to redeem.
 */
export async function createCardPayment(
  plan: PlanType,
  paymentType: PaymentType,
  payerEmail: string,
  payerName: string,
  memberId: string,
  cardToken: string,
  installments = 1,
): Promise<CardPaymentData | null> {
  const amount = calculatePlanPrice(plan, paymentType)
  const planName = PLANS[plan].name

  try {
    const result = await api.post<{
      paymentId: string
      chargeId: string
      status: string
      installments: number
      cardBrand: string | null
      cardLastFour: string | null
    }>('/checkout/card/create', {
      amount,
      description: `Clube GeekPop & Toys - Plano ${planName}`,
      payer_email: payerEmail,
      payer_name: payerName,
      external_reference: memberId,
      card_token: cardToken,
      installments,
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
      paymentId: data.paymentId,
      chargeId: data.chargeId,
      status: (data.status as PaymentStatus) || 'pending',
      installments: data.installments ?? 1,
      cardBrand: data.cardBrand ?? null,
      cardLastFour: data.cardLastFour ?? null,
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
  status: string
  cardBrand: string | null
  cardLastFour: string | null
  nextBillingAt: string | null
}

/**
 * Start the monthly recurrence.
 *
 * Takes the same one-shot card token as a single charge: Pagar.me keeps the
 * card on the subscription from there on, and bills it every month without
 * anything else being stored on our side.
 */
export async function createSubscriptionPayment(
  plan: PlanType,
  paymentType: PaymentType,
  payerEmail: string,
  payerName: string,
  memberId: string,
  cardToken: string,
): Promise<SubscriptionPaymentData | null> {
  const amount = calculatePlanPrice(plan, paymentType)

  try {
    const result = await api.post<{
      id: string
      status: string
      cardBrand: string | null
      cardLastFour: string | null
      nextBillingAt: string | null
    }>('/subscription/create', {
      member_id: memberId,
      plan,
      frequency_type: paymentType === 'annual' ? 'years' : 'months',
      payer_email: payerEmail,
      payer_name: payerName,
      transaction_amount: amount,
      card_token: cardToken,
    })

    if (result.error || !result.data) {
      throw new Error(result.error || 'Resposta inválida do servidor ao criar assinatura')
    }

    const data = result.data
    return {
      subscriptionId: data.id,
      status: data.status,
      cardBrand: data.cardBrand ?? null,
      cardLastFour: data.cardLastFour ?? null,
      nextBillingAt: data.nextBillingAt ?? null,
    }
  } catch (error) {
    paymentLogger.error('Error creating subscription:', error)
    throw error
  }
}

