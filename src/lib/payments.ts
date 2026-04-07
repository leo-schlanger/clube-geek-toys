import { api, API_URL } from './api-client'
import { paymentLogger } from './logger'
import type { Payment, PaymentMethod, PaymentStatus, PlanType, PaymentType } from '../types'
import { PLANS } from '../types'

// ============================================
// CONFIGURATION
// ============================================

const PAGBANK_PUBLIC_KEY = import.meta.env.VITE_PAGBANK_PUBLIC_KEY || ''

/**
 * Check if PagBank is configured
 */
export function isPagBankConfigured(): boolean {
  return Boolean(PAGBANK_PUBLIC_KEY && API_URL)
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

export async function createPayment(
  _memberId: string,
  _amount: number,
  _method: PaymentMethod,
  _reference?: string
): Promise<Payment | null> {
  return null
}

export async function updatePaymentStatus(
  _paymentId: string,
  _status: PaymentStatus,
  _reference?: string
): Promise<boolean> {
  return true
}

export async function getMemberPayments(_memberId: string): Promise<Payment[]> {
  return []
}

// ============================================
// PAGBANK - PIX
// ============================================

export interface PixPaymentData {
  paymentId: string
  qrCode: string
  qrCodeBase64: string
  qrCodeImageUrl: string
  pixKey: string
  expiresAt: string
  amount: number
}

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

  if (!API_URL) {
    const isDevelopment = import.meta.env.VITE_ENVIRONMENT === 'development' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'

    if (!isDevelopment) {
      paymentLogger.error('CRITICAL: Payment API not configured in production!')
      return null
    }

    paymentLogger.warn('DEV MODE: Payment API not configured. Using simulation mode.')
    return generatePixPaymentSimulation(amount, description, memberId)
  }

  try {
    const result = await api.post('/pix/create', {
      amount,
      description,
      payer_email: payerEmail,
      external_reference: memberId,
    })

    if (result.error) throw new Error(result.error)
    const data = result.data

    return {
      paymentId: data.id,
      qrCode: data.qr_code || '',
      qrCodeBase64: data.qr_code_base64 || '',
      qrCodeImageUrl: data.qr_code_image_url || '',
      pixKey: data.qr_code || '',
      expiresAt: data.expires_at || new Date(Date.now() + 30 * 60000).toISOString(),
      amount: data.amount || amount,
    }
  } catch (error) {
    paymentLogger.error('Error creating PIX payment:', error)
    return null
  }
}

function generatePixPaymentSimulation(
  amount: number,
  _description: string,
  memberId: string
): PixPaymentData | null {
  const pixKey = import.meta.env.VITE_PIX_KEY

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
    qrCodeImageUrl: '',
    pixKey,
    expiresAt: expiresAt.toISOString(),
    amount,
  }
}

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
 * Check PIX payment status via PagBank order
 */
export async function checkPixPaymentStatus(paymentId: string): Promise<PaymentStatus | null> {
  try {
    const result = await api.get(`/payment/status/${paymentId}`)
    if (result.error) return null

    return result.data.mapped_status || 'pending'
  } catch (error) {
    paymentLogger.error('Error checking payment status:', error)
    return null
  }
}

/**
 * Check payment by order ID
 */
export async function checkPaymentById(paymentId: string): Promise<{
  status: PaymentStatus
  externalReference?: string
} | null> {
  if (!paymentId) return null

  try {
    const result = await api.get(`/payment/status/${paymentId}`)
    if (result.error) return null

    return {
      status: result.data.mapped_status || 'pending',
      externalReference: result.data.external_reference,
    }
  } catch (error) {
    paymentLogger.error('Error checking payment by ID:', error)
    return null
  }
}

/**
 * Create card payment via PagBank (direct, no redirect)
 */
export async function createCardPayment(
  plan: PlanType,
  paymentType: PaymentType,
  memberEmail: string,
  memberName: string,
  memberId: string,
  encryptedCard: string
): Promise<{ id: string, status: string } | null> {
  try {
    const amount = calculatePlanPrice(plan, paymentType)
    const planData = PLANS[plan]

    const result = await api.post('/checkout/create', {
      amount,
      description: `Clube Geek & Toys - Plano ${planData.name} (${paymentType === 'monthly' ? 'Mensal' : 'Anual'})`,
      payer_email: memberEmail,
      payer_name: memberName,
      encrypted_card: encryptedCard,
      external_reference: memberId,
    })

    if (result.error) throw new Error(result.error)

    return {
      id: result.data.id,
      status: result.data.status,
    }
  } catch (error) {
    paymentLogger.error('Error creating card payment:', error)
    return null
  }
}

export function getPaymentStatusLabel(status: PaymentStatus): string {
  const labels: Record<string, string> = {
    paid: 'Pago',
    pending: 'Pendente',
    failed: 'Falhou',
    refunded: 'Reembolsado'
  }
  return labels[status] || status
}

export function getPaymentStatusColor(status: PaymentStatus): string {
  const colors: Record<string, string> = {
    paid: 'text-green-500',
    pending: 'text-yellow-500',
    failed: 'text-red-500',
    refunded: 'text-blue-500'
  }
  return colors[status] || 'text-gray-500'
}
