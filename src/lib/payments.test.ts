/**
 * Payments API client — Unit Tests
 *
 * Tests all exported functions from payments.ts.
 * Mocks api-client, logger, and stripe modules.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock api-client
vi.mock('./api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  API_URL: 'http://localhost:3001',
}))

// Mock logger (suppress output)
vi.mock('./logger', () => ({
  paymentLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock stripe
vi.mock('./stripe', () => ({
  isStripeConfigured: vi.fn(() => true),
}))

import { api } from './api-client'
import { isStripeConfigured } from './stripe'
import {
  isPaymentConfigured,
  calculatePlanPrice,
  getMemberPayments,
  generatePixPayment,
  createCardPayment,
  checkPaymentStatus,
  checkPixPaymentStatus,
  createSubscriptionPayment,
} from './payments'

const mockedApi = vi.mocked(api)
const mockedIsStripeConfigured = vi.mocked(isStripeConfigured)

// ============================================
// Tests
// ============================================

describe('Payments API client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedIsStripeConfigured.mockReturnValue(true)
  })

  // ---- isPaymentConfigured ----

  describe('isPaymentConfigured', () => {
    it('should return true when API_URL and Stripe are configured', () => {
      expect(isPaymentConfigured()).toBe(true)
    })

    it('should return false when Stripe is not configured', () => {
      mockedIsStripeConfigured.mockReturnValue(false)

      expect(isPaymentConfigured()).toBe(false)
    })
  })

  // ---- calculatePlanPrice ----

  describe('calculatePlanPrice', () => {
    it('deve retornar o preço anual do clube (149.99)', () => {
      expect(calculatePlanPrice('club', 'annual')).toBe(149.99)
    })
  })

  // ---- getMemberPayments ----

  describe('getMemberPayments', () => {
    it('should call GET /payments with member_id filter', async () => {
      const payments = [{ id: 'p1', amount: 39.90 }]
      mockedApi.get.mockResolvedValue({ data: payments, status: 200 })

      const result = await getMemberPayments('member-1')

      expect(mockedApi.get).toHaveBeenCalledWith('/payments?member_id=member-1&limit=50')
      expect(result).toEqual(payments)
    })

    it('should return empty array when data is undefined', async () => {
      mockedApi.get.mockResolvedValue({ data: undefined, status: 200 })

      const result = await getMemberPayments('member-1')

      expect(result).toEqual([])
    })

    it('should return empty array on API error', async () => {
      mockedApi.get.mockRejectedValue(new Error('Network error'))

      const result = await getMemberPayments('member-1')

      expect(result).toEqual([])
    })
  })

  // ---- generatePixPayment ----

  describe('generatePixPayment', () => {
    it('should return null for empty memberId', async () => {
      const result = await generatePixPayment(39.90, 'Test', 'a@b.com', '')

      expect(mockedApi.post).not.toHaveBeenCalled()
      expect(result).toBeNull()
    })

    it('should return null for whitespace-only memberId', async () => {
      const result = await generatePixPayment(39.90, 'Test', 'a@b.com', '   ')

      expect(mockedApi.post).not.toHaveBeenCalled()
      expect(result).toBeNull()
    })

    it('should POST /pix/create and return mapped PIX data', async () => {
      mockedApi.post.mockResolvedValue({
        data: {
          paymentId: 'pay-123',
          pixData: {
            emvCode: 'EMV_CODE_STRING',
            pixKey: 'pix-key-uuid',
            amount: 39.90,
            txId: 'tx-abc',
            expiresAt: '2026-06-01T00:00:00Z',
          },
        },
        status: 201,
      })

      const result = await generatePixPayment(39.90, 'Plano Gold', 'user@test.com', 'member-1')

      expect(mockedApi.post).toHaveBeenCalledWith('/pix/create', {
        amount: 39.90,
        description: 'Plano Gold',
        payer_email: 'user@test.com',
        external_reference: 'member-1',
      })

      expect(result).toEqual({
        paymentIntentId: 'pay-123',
        clientSecret: '',
        qrCode: 'EMV_CODE_STRING',
        qrCodeBase64: '',
        qrCodeImageUrl: '',
        pixKey: 'pix-key-uuid',
        expiresAt: '2026-06-01T00:00:00Z',
        amount: 39.90,
      })
    })

    it('should throw when API returns an error', async () => {
      mockedApi.post.mockResolvedValue({
        error: 'Payment limit exceeded',
        code: 'LIMIT_EXCEEDED',
        status: 400,
      })

      await expect(
        generatePixPayment(39.90, 'Test', 'a@b.com', 'member-1')
      ).rejects.toThrow('Payment limit exceeded')
    })

    it('should throw when API returns no data', async () => {
      mockedApi.post.mockResolvedValue({ data: undefined, status: 200 })

      await expect(
        generatePixPayment(39.90, 'Test', 'a@b.com', 'member-1')
      ).rejects.toThrow('Resposta inválida do servidor ao criar pagamento PIX')
    })

    it('should propagate network errors', async () => {
      mockedApi.post.mockRejectedValue(new Error('Network failure'))

      await expect(
        generatePixPayment(39.90, 'Test', 'a@b.com', 'member-1')
      ).rejects.toThrow('Network failure')
    })
  })

  // ---- createCardPayment ----

  describe('createCardPayment', () => {
    it('should POST /checkout/card/create with computed amount and plan name', async () => {
      mockedApi.post.mockResolvedValue({
        data: {
          paymentIntentId: 'pi_123',
          clientSecret: 'cs_secret',
          status: 'requires_payment_method',
        },
        status: 201,
      })

      const result = await createCardPayment('club', 'annual', 'payer@test.com', 'Payer Name', 'member-1')

      expect(mockedApi.post).toHaveBeenCalledWith('/checkout/card/create', {
        amount: 149.99,
        description: 'Clube Geek & Toys - Plano Clube Geek & Toys',
        payer_email: 'payer@test.com',
        payer_name: 'Payer Name',
        external_reference: 'member-1',
      })

      expect(result).toEqual({
        paymentIntentId: 'pi_123',
        clientSecret: 'cs_secret',
        status: 'requires_payment_method',
      })
    })

    it('should default status to pending when not provided', async () => {
      mockedApi.post.mockResolvedValue({
        data: {
          paymentIntentId: 'pi_123',
          clientSecret: 'cs_secret',
        },
        status: 201,
      })

      const result = await createCardPayment('club', 'annual', 'a@b.com', 'Name', 'member-1')

      expect(result?.status).toBe('pending')
    })

    it('should throw when API returns an error', async () => {
      mockedApi.post.mockResolvedValue({
        error: 'Invalid card',
        code: 'CARD_DECLINED',
        status: 400,
      })

      await expect(
        createCardPayment('club', 'annual', 'a@b.com', 'Name', 'member-1')
      ).rejects.toThrow('Invalid card')
    })

    it('should throw when API returns no data', async () => {
      mockedApi.post.mockResolvedValue({ data: undefined, status: 200 })

      await expect(
        createCardPayment('club', 'annual', 'a@b.com', 'Name', 'member-1')
      ).rejects.toThrow('Resposta inválida do servidor ao criar pagamento com cartão')
    })

    it('should propagate network errors', async () => {
      mockedApi.post.mockRejectedValue(new Error('Connection refused'))

      await expect(
        createCardPayment('club', 'annual', 'a@b.com', 'Name', 'member-1')
      ).rejects.toThrow('Connection refused')
    })
  })

  // ---- checkPaymentStatus ----

  describe('checkPaymentStatus', () => {
    it('should call GET /payment/status/:id and return mapped_status', async () => {
      mockedApi.get.mockResolvedValue({ data: { mapped_status: 'paid' }, status: 200 })

      const result = await checkPaymentStatus('pi_123')

      expect(mockedApi.get).toHaveBeenCalledWith('/payment/status/pi_123')
      expect(result).toBe('paid')
    })

    it('should return pending when data is undefined', async () => {
      mockedApi.get.mockResolvedValue({ data: undefined, status: 200 })

      const result = await checkPaymentStatus('pi_123')

      expect(result).toBe('pending')
    })

    it('should return pending on API error', async () => {
      mockedApi.get.mockRejectedValue(new Error('Server error'))

      const result = await checkPaymentStatus('pi_123')

      expect(result).toBe('pending')
    })
  })

  // ---- checkPixPaymentStatus ----

  describe('checkPixPaymentStatus', () => {
    it('should delegate to checkPaymentStatus', async () => {
      mockedApi.get.mockResolvedValue({ data: { mapped_status: 'paid' }, status: 200 })

      const result = await checkPixPaymentStatus('pix-pay-123')

      expect(mockedApi.get).toHaveBeenCalledWith('/payment/status/pix-pay-123')
      expect(result).toBe('paid')
    })
  })

  // ---- createSubscriptionPayment ----

  describe('createSubscriptionPayment', () => {
    it('deve fazer POST /subscription/create com frequency_type years e preço do clube', async () => {
      mockedApi.post.mockResolvedValue({
        data: {
          id: 'sub_123',
          clientSecret: 'cs_sub_secret',
          status: 'active',
        },
        status: 201,
      })

      const result = await createSubscriptionPayment(
        'club', 'annual', 'payer@test.com', 'Payer Name', 'member-1'
      )

      expect(mockedApi.post).toHaveBeenCalledWith('/subscription/create', {
        member_id: 'member-1',
        plan: 'club',
        frequency_type: 'years',
        payer_email: 'payer@test.com',
        payer_name: 'Payer Name',
        transaction_amount: 149.99,
      })

      expect(result).toEqual({
        subscriptionId: 'sub_123',
        clientSecret: 'cs_sub_secret',
        status: 'active',
      })
    })

    it('deve lançar erro quando a API retorna erro', async () => {
      mockedApi.post.mockResolvedValue({ error: 'Subscription failed', status: 400 })

      await expect(
        createSubscriptionPayment('club', 'annual', 'a@b.com', 'Name', 'member-1')
      ).rejects.toThrow('Subscription failed')
    })

    it('deve lançar erro quando a API não retorna dados', async () => {
      mockedApi.post.mockResolvedValue({ data: undefined, status: 200 })

      await expect(
        createSubscriptionPayment('club', 'annual', 'a@b.com', 'Name', 'member-1')
      ).rejects.toThrow('Resposta inválida do servidor ao criar assinatura')
    })

    it('deve propagar erros de rede', async () => {
      mockedApi.post.mockRejectedValue(new Error('Timeout'))

      await expect(
        createSubscriptionPayment('club', 'annual', 'a@b.com', 'Name', 'member-1')
      ).rejects.toThrow('Timeout')
    })
  })
})
