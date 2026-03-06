import { where, orderBy, type DocumentData } from 'firebase/firestore'
import { FirestoreManager, MapperUtils } from './db-utils'
import type { Payment, PaymentMethod, PaymentStatus, PlanType, PaymentType } from '../types'
import { PLANS } from '../types'

const PAYMENTS_COLLECTION = 'payments'

// ============================================
// CONFIGURATION
// ============================================

const MERCADOPAGO_PUBLIC_KEY = import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY || ''
const PAYMENT_API_URL = import.meta.env.VITE_PAYMENT_API_URL || ''

/**
 * Check if Mercado Pago is configured
 */
export function isMercadoPagoConfigured(): boolean {
  return Boolean(MERCADOPAGO_PUBLIC_KEY && PAYMENT_API_URL)
}

// ============================================
// CALCULATIONS
// ============================================

/**
 * Calculate plan price based on payment type
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
 * Create payment record
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
  const data: any = { status }
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
 * Generate PIX payment via Mercado Pago API
 */
export async function generatePixPayment(
  amount: number,
  description: string,
  payerEmail: string,
  memberId: string
): Promise<PixPaymentData | null> {
  if (!PAYMENT_API_URL) {
    console.warn('⚠️ Payment API not configured. Using simulation mode.')
    return generatePixPaymentSimulation(amount, description, memberId)
  }

  try {
    const response = await fetch(`${PAYMENT_API_URL}/pix/create`, {
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
    console.error('Error creating PIX payment:', error)
    return null
  }
}

/**
 * PIX simulation for development
 */
function generatePixPaymentSimulation(
  amount: number,
  _description: string,
  memberId: string
): PixPaymentData {
  const pixKey = import.meta.env.VITE_PIX_KEY || 'your-pix-key@email.com'
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
    const response = await fetch(`${PAYMENT_API_URL}/pix/status/${paymentId}`)
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
    console.error('Error checking payment status:', error)
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

    const response = await fetch(`${PAYMENT_API_URL}/checkout/create`, {
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
    console.error('Error creating checkout preference:', error)
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
