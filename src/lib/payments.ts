import { where, orderBy, type DocumentData } from 'firebase/firestore'
import { FirestoreManager, MapperUtils } from './db-utils'
import { paymentLogger } from './logger'
import { COLLECTIONS } from './constants'
import type { Payment, PaymentMethod, PaymentStatus, PlanType, PaymentType } from '../types'
import { PLANS } from '../types'

const PAYMENTS_COLLECTION = COLLECTIONS.PAYMENTS

// ============================================
// CONFIGURATION
// ============================================

const MERCADOPAGO_PUBLIC_KEY = import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY || ''
const PAYMENT_API_URL = import.meta.env.VITE_PAYMENT_API_URL || ''

// Request configuration
const DEFAULT_TIMEOUT = 15000 // 15 seconds
const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY = 1000 // 1 second

/**
 * Check if Mercado Pago is configured
 */
export function isMercadoPagoConfigured(): boolean {
  return Boolean(MERCADOPAGO_PUBLIC_KEY && PAYMENT_API_URL)
}

// ============================================
// FETCH HELPERS WITH TIMEOUT AND RETRY
// ============================================

/**
 * Fetch with timeout support
 */
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

/**
 * Fetch with exponential backoff retry
 */
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

      // Don't retry on client errors (4xx), only on server errors (5xx) or network issues
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response
      }

      // Server error - will retry
      lastError = new Error(`Server error: ${response.status}`)
    } catch (error) {
      lastError = error as Error

      // Don't retry if aborted intentionally
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`)
      }
    }

    // Wait before retry with exponential backoff
    if (attempt < maxRetries - 1) {
      const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError || new Error('Request failed after retries')
}

// ============================================
// CALCULATIONS
// ============================================

/**
 * Calcula preço do plano baseado no tipo de pagamento
 * @param plan - Tipo do plano (silver, gold, black)
 * @param paymentType - Tipo de pagamento (monthly, annual)
 * @returns Valor em reais
 * @example
 * const price = calculatePlanPrice('gold', 'annual')
 * // Retorna o valor anual do plano Gold
 */
export function calculatePlanPrice(plan: PlanType, paymentType: PaymentType): number {
  const planData = PLANS[plan]
  return paymentType === 'monthly' ? planData.priceMonthly : planData.priceAnnual
}

// ============================================
// FIRESTORE CRUD
// ============================================

/**
 * Convert Firestore document to Payment type
 */
function toPayment(id: string, data: DocumentData): Payment {
  const mapped = MapperUtils.toCamel(data)
  return {
    id,
    memberId: mapped.memberId,
    amount: mapped.amount,
    method: mapped.method,
    status: mapped.status,
    reference: mapped.reference,
    paidAt: mapped.paidAt,
    createdAt: mapped.createdAt,
  }
}

/**
 * Cria registro de pagamento no Firestore
 * @param memberId - ID do membro
 * @param amount - Valor em reais
 * @param method - Método de pagamento (pix, card, cash)
 * @param reference - Referência externa opcional (ID do Mercado Pago)
 * @returns Pagamento criado ou null em caso de erro
 */
export async function createPayment(
  memberId: string,
  amount: number,
  method: PaymentMethod,
  reference?: string
): Promise<Payment | null> {
  const paymentData = MapperUtils.toSnake({
    memberId,
    amount,
    method,
    status: 'pending',
    reference: reference || undefined,
  })

  const id = await FirestoreManager.save(PAYMENTS_COLLECTION, null, paymentData)
  if (!id) return null

  return toPayment(id, paymentData)
}

/**
 * Update payment status
 */
export async function updatePaymentStatus(
  paymentId: string,
  status: PaymentStatus,
  reference?: string
): Promise<boolean> {
  const data: Record<string, string> = { status }
  if (reference) data.reference = reference
  if (status === 'paid') data.paid_at = new Date().toISOString()

  return FirestoreManager.update(PAYMENTS_COLLECTION, paymentId, data)
}

/**
 * Get member payments
 */
export async function getMemberPayments(memberId: string): Promise<Payment[]> {
  return FirestoreManager.findMany(
    PAYMENTS_COLLECTION,
    [where('member_id', '==', memberId), orderBy('created_at', 'desc')],
    toPayment
  )
}

// ============================================
// MERCADO PAGO - PIX
// ============================================

export interface PixPaymentData {
  paymentId: string
  qrCode: string
  qrCodeBase64: string
  pixKey: string
  expiresAt: string
  amount: number
}

/**
 * Gera pagamento PIX via API do Mercado Pago
 * @param amount - Valor em reais
 * @param description - Descrição do pagamento
 * @param payerEmail - Email do pagador
 * @param memberId - ID do membro (usado como referência externa)
 * @returns Dados do PIX (QR Code, chave) ou null em caso de erro
 * @example
 * const pix = await generatePixPayment(99.90, 'Plano Gold', 'email@test.com', 'member123')
 * if (pix) {
 *   showQRCode(pix.qrCode)
 * }
 */
export async function generatePixPayment(
  amount: number,
  description: string,
  payerEmail: string,
  memberId: string
): Promise<PixPaymentData | null> {
  if (!PAYMENT_API_URL) {
    paymentLogger.warn('Payment API not configured. Using simulation mode.')
    return generatePixPaymentSimulation(amount, description, memberId)
  }

  try {
    const response = await fetchWithRetry(`${PAYMENT_API_URL}/pix/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        description,
        payer_email: payerEmail,
        external_reference: memberId,
      }),
    })

    if (!response.ok) throw new Error('Failed to create PIX payment')
    const data = await response.json()

    return {
      paymentId: data.id,
      qrCode: data.point_of_interaction.transaction_data.qr_code,
      qrCodeBase64: data.point_of_interaction.transaction_data.qr_code_base64,
      pixKey: data.point_of_interaction.transaction_data.qr_code,
      expiresAt: data.date_of_expiration,
      amount: data.transaction_amount,
    }
  } catch (error) {
    paymentLogger.error('Error creating PIX payment:', error)
    return null
  }
}

/**
 * PIX simulation for development
 * SECURITY: Only works if VITE_PIX_KEY is properly configured
 */
function generatePixPaymentSimulation(
  amount: number,
  _description: string,
  memberId: string
): PixPaymentData | null {
  const pixKey = import.meta.env.VITE_PIX_KEY

  // CRITICAL: Do not use placeholder PIX key
  if (!pixKey || pixKey === 'your-pix-key@email.com') {
    paymentLogger.error('VITE_PIX_KEY not configured. Cannot generate PIX simulation.')
    return null
  }
  const emvCode = generateEMVCode({
    pixKey,
    merchantName: 'GEEK AND TOYS',
    merchantCity: 'SAO PAULO',
    amount,
    txid: memberId.substring(0, 25),
  })

  const expiresAt = new Date()
  expiresAt.setMinutes(expiresAt.getMinutes() + 30)

  return {
    paymentId: `sim_${Date.now()}`,
    qrCode: emvCode,
    qrCodeBase64: '',
    pixKey,
    expiresAt: expiresAt.toISOString(),
    amount,
  }
}

/**
 * Generate EMV code for PIX
 */
function generateEMVCode(params: {
  pixKey: string
  merchantName: string
  merchantCity: string
  amount: number
  txid: string
}): string {
  const { pixKey, merchantName, merchantCity, amount, txid } = params
  const formattedAmount = amount.toFixed(2)
  let payload = '000201'

  const gui = '0014br.gov.bcb.pix'
  const key = `01${pixKey.length.toString().padStart(2, '0')}${pixKey}`
  const merchantAccount = `${gui}${key}`
  payload += `26${merchantAccount.length.toString().padStart(2, '0')}${merchantAccount}`
  payload += '52040000'
  payload += '5303986'
  payload += `54${formattedAmount.length.toString().padStart(2, '0')}${formattedAmount}`
  payload += '5802BR'

  const cleanName = merchantName.substring(0, 25).toUpperCase()
  payload += `59${cleanName.length.toString().padStart(2, '0')}${cleanName}`

  const cleanCity = merchantCity.substring(0, 15).toUpperCase()
  payload += `60${cleanCity.length.toString().padStart(2, '0')}${cleanCity}`

  const txidField = `05${txid.length.toString().padStart(2, '0')}${txid}`
  payload += `62${txidField.length.toString().padStart(2, '0')}${txidField}`
  payload += '6304'

  const crc = (function calculateCRC16(str: string): string {
    let crc = 0xFFFF
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8
      for (let j = 0; j < 8; j++) {
        crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1
      }
    }
    return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0')
  })(payload)

  return payload.slice(0, -4) + '6304' + crc
}

/**
 * Check PIX payment status
 */
export async function checkPixPaymentStatus(paymentId: string): Promise<PaymentStatus | null> {
  if (!PAYMENT_API_URL) return null

  try {
    const response = await fetchWithRetry(`${PAYMENT_API_URL}/pix/status/${paymentId}`)
    if (!response.ok) throw new Error('Failed to check payment status')
    const data = await response.json()

    switch (data.status) {
      case 'approved': return 'paid'
      case 'pending':
      case 'in_process': return 'pending'
      case 'rejected':
      case 'cancelled': return 'failed'
      default: return 'pending'
    }
  } catch (error) {
    paymentLogger.error('Error checking payment status:', error)
    return null
  }
}

/**
 * Check payment status by Mercado Pago payment ID (for checkout redirect validation)
 */
export async function checkPaymentById(paymentId: string): Promise<{
  status: PaymentStatus
  externalReference?: string
} | null> {
  if (!PAYMENT_API_URL || !paymentId) return null

  try {
    const response = await fetchWithRetry(`${PAYMENT_API_URL}/payment/status/${paymentId}`)
    if (!response.ok) return null
    const data = await response.json()

    let status: PaymentStatus = 'pending'
    switch (data.status) {
      case 'approved': status = 'paid'; break
      case 'rejected':
      case 'cancelled': status = 'failed'; break
      case 'refunded': status = 'refunded'; break
      default: status = 'pending'
    }

    return {
      status,
      externalReference: data.external_reference,
    }
  } catch (error) {
    paymentLogger.error('Error checking payment by ID:', error)
    return null
  }
}

/**
 * Create checkout preference for card payment
 */
export async function createCheckoutPreference(
  plan: PlanType,
  paymentType: PaymentType,
  memberEmail: string,
  memberId: string
): Promise<{ id: string, initPoint: string, sandboxInitPoint: string } | null> {
  if (!PAYMENT_API_URL) return null

  try {
    const amount = calculatePlanPrice(plan, paymentType)
    const planData = PLANS[plan]

    const response = await fetchWithRetry(`${PAYMENT_API_URL}/checkout/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{
          title: `Clube Geek & Toys - Plano ${planData.name}`,
          description: `Assinatura ${paymentType === 'monthly' ? 'Mensal' : 'Anual'}`,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: amount,
        }],
        payer: { email: memberEmail },
        external_reference: memberId,
        back_urls: {
          success: `${window.location.origin}/pagamento/sucesso`,
          failure: `${window.location.origin}/pagamento/erro`,
          pending: `${window.location.origin}/pagamento/pendente`,
        },
        auto_return: 'approved',
        notification_url: `${PAYMENT_API_URL}/webhook/mercadopago`,
      }),
    })

    if (!response.ok) throw new Error('Failed to create checkout preference')
    const data = await response.json()

    return {
      id: data.id,
      initPoint: data.init_point,
      sandboxInitPoint: data.sandbox_init_point,
    }
  } catch (error) {
    paymentLogger.error('Error creating checkout preference:', error)
    return null
  }
}

/**
 * Get payment status label in Portuguese
 */
export function getPaymentStatusLabel(status: PaymentStatus): string {
  const labels: Record<string, string> = {
    paid: 'Pago',
    pending: 'Pendente',
    failed: 'Falhou',
    refunded: 'Reembolsado'
  }
  return labels[status] || status
}

/**
 * Get payment status color class
 */
export function getPaymentStatusColor(status: PaymentStatus): string {
  const colors: Record<string, string> = {
    paid: 'text-green-500',
    pending: 'text-yellow-500',
    failed: 'text-red-500',
    refunded: 'text-blue-500'
  }
  return colors[status] || 'text-gray-500'
}
