/**
 * Payments API client — Unit Tests
 *
 * Tests all exported functions from payments.ts. `api-client`, `logger` and
 * `pagarme` are mocked; what is asserted is the **shape of the request** — the
 * amount, the field names and, above all, that only a token is ever sent where
 * a card used to go.
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

// Mock the Pagar.me client. `getPaymentConfig` is the only thing payments.ts
// reaches for; tokenization itself lives in the card form, not here.
vi.mock('./pagarme', () => ({
  getPaymentConfig: vi.fn(async () => ({
    provider: 'pagarme',
    publicKey: 'pk_test',
    configured: true,
    maxInstallments: 6,
    minInstallmentAmount: 20,
    pixExpiresIn: 3600,
  })),
}))

import { api } from './api-client'
import { getPaymentConfig } from './pagarme'
import {
  isPaymentConfigured,
  isCardPaymentAvailable,
  calculatePlanPrice,
  getMemberPayments,
  generatePixPayment,
  createCardPayment,
  checkPaymentStatus,
  checkPixPaymentStatus,
  createSubscriptionPayment,
} from './payments'

const mockedApi = vi.mocked(api)
const mockedGetPaymentConfig = vi.mocked(getPaymentConfig)

// ============================================
// Tests
// ============================================

describe('Payments API client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetPaymentConfig.mockResolvedValue({
      provider: 'pagarme',
      publicKey: 'pk_test',
      configured: true,
      maxInstallments: 6,
      minInstallmentAmount: 20,
      pixExpiresIn: 3600,
    })
  })

  // ---- isPaymentConfigured ----

  describe('isPaymentConfigured', () => {
    it('only asks whether there is an API to talk to', () => {
      expect(isPaymentConfigured()).toBe(true)
    })

    /**
     * Whether the *provider* is usable is a server fact now, not a build-time
     * one: the key comes from `GET /payments/config`, so rotating it on the VPS
     * takes effect without a frontend deploy.
     */
    it('reports card availability from the server config', async () => {
      await expect(isCardPaymentAvailable()).resolves.toBe(true)

      mockedGetPaymentConfig.mockResolvedValueOnce({
        provider: 'pagarme',
        publicKey: null,
        configured: false,
        maxInstallments: 1,
        minInstallmentAmount: 20,
        pixExpiresIn: 3600,
      })
      await expect(isCardPaymentAvailable()).resolves.toBe(false)
    })
  })

  // ---- calculatePlanPrice ----

  describe('calculatePlanPrice', () => {
    it('returns the monthly club price (12.50)', () => {
      expect(calculatePlanPrice('club', 'monthly')).toBe(12.50)
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
            txId: 'ch_abc',
            expiresAt: '2026-06-01T00:00:00Z',
            qrCodeUrl: 'https://api.pagar.me/qr/ch_abc.png',
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
        // Nothing to redeem: a Pagar.me QR is already payable.
        clientSecret: '',
        qrCode: 'EMV_CODE_STRING',
        qrCodeBase64: '',
        qrCodeImageUrl: 'https://api.pagar.me/qr/ch_abc.png',
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
    const approved = {
      paymentId: 'pay_1',
      chargeId: 'ch_1',
      status: 'paid',
      installments: 1,
      cardBrand: 'visa',
      cardLastFour: '4242',
    }

    it('sends the card token and the split, never card data', async () => {
      mockedApi.post.mockResolvedValue({ data: approved, status: 201 })

      const result = await createCardPayment(
        'club', 'annual', 'payer@test.com', 'Payer Name', 'member-1', 'token_abc', 1
      )

      expect(mockedApi.post).toHaveBeenCalledWith('/checkout/card/create', {
        amount: 12.50,
        description: 'Clube GeekPop & Toys - Plano Clube GeekPop & Toys',
        payer_email: 'payer@test.com',
        payer_name: 'Payer Name',
        external_reference: 'member-1',
        card_token: 'token_abc',
        installments: 1,
      })

      // Nothing resembling a card credential may be in the payload.
      const [, body] = mockedApi.post.mock.calls[0]
      expect(JSON.stringify(body)).not.toMatch(/cvv|exp_month|exp_year|holder_name/)

      expect(result).toEqual({
        paymentId: 'pay_1',
        chargeId: 'ch_1',
        status: 'paid',
        installments: 1,
        cardBrand: 'visa',
        cardLastFour: '4242',
      })
    })

    it('defaults to a single instalment', async () => {
      mockedApi.post.mockResolvedValue({ data: approved, status: 201 })

      await createCardPayment('club', 'annual', 'a@b.com', 'Name', 'member-1', 'token_abc')

      expect(mockedApi.post.mock.calls[0][1]).toMatchObject({ installments: 1 })
    })

    it('should default status to pending when not provided', async () => {
      mockedApi.post.mockResolvedValue({
        data: { paymentId: 'pay_1', chargeId: 'ch_1' },
        status: 201,
      })

      const result = await createCardPayment(
        'club', 'annual', 'a@b.com', 'Name', 'member-1', 'token_abc'
      )

      expect(result?.status).toBe('pending')
    })

    /**
     * A decline is a 402 from the server, with the acquirer's reason already in
     * Portuguese. The client only has to let it through.
     */
    it('should throw when API returns an error', async () => {
      mockedApi.post.mockResolvedValue({
        error: 'Cartão recusado: saldo ou limite insuficiente.',
        code: 'CARD_DECLINED',
        status: 402,
      })

      await expect(
        createCardPayment('club', 'annual', 'a@b.com', 'Name', 'member-1', 'token_abc')
      ).rejects.toThrow('saldo ou limite insuficiente')
    })

    it('should throw when API returns no data', async () => {
      mockedApi.post.mockResolvedValue({ data: undefined, status: 200 })

      await expect(
        createCardPayment('club', 'annual', 'a@b.com', 'Name', 'member-1', 'token_abc')
      ).rejects.toThrow('Resposta inválida do servidor ao criar pagamento com cartão')
    })

    it('should propagate network errors', async () => {
      mockedApi.post.mockRejectedValue(new Error('Connection refused'))

      await expect(
        createCardPayment('club', 'annual', 'a@b.com', 'Name', 'member-1', 'token_abc')
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
    const created = {
      id: 'sub_123',
      status: 'active',
      cardBrand: 'visa',
      cardLastFour: '4242',
      nextBillingAt: '2026-10-01T00:00:00Z',
    }

    it('POSTs /subscription/create with the card token and the club price', async () => {
      mockedApi.post.mockResolvedValue({ data: created, status: 201 })

      const result = await createSubscriptionPayment(
        'club', 'monthly', 'payer@test.com', 'Payer Name', 'member-1', 'token_abc'
      )

      expect(mockedApi.post).toHaveBeenCalledWith('/subscription/create', {
        member_id: 'member-1',
        plan: 'club',
        frequency_type: 'months',
        payer_email: 'payer@test.com',
        payer_name: 'Payer Name',
        transaction_amount: 12.50,
        card_token: 'token_abc',
      })

      // Pagar.me authorises the first charge synchronously, so there is no
      // `clientSecret` to hand back — only the outcome and the card billed.
      expect(result).toEqual({
        subscriptionId: 'sub_123',
        status: 'active',
        cardBrand: 'visa',
        cardLastFour: '4242',
        nextBillingAt: '2026-10-01T00:00:00Z',
      })
      expect(result).not.toHaveProperty('clientSecret')
    })

    it('throws when the API returns an error', async () => {
      mockedApi.post.mockResolvedValue({ error: 'Subscription failed', status: 400 })

      await expect(
        createSubscriptionPayment('club', 'monthly', 'a@b.com', 'Name', 'member-1', 'token_abc')
      ).rejects.toThrow('Subscription failed')
    })

    it('throws when the API returns no data', async () => {
      mockedApi.post.mockResolvedValue({ data: undefined, status: 200 })

      await expect(
        createSubscriptionPayment('club', 'monthly', 'a@b.com', 'Name', 'member-1', 'token_abc')
      ).rejects.toThrow('Resposta inválida do servidor ao criar assinatura')
    })

    it('propagates network errors', async () => {
      mockedApi.post.mockRejectedValue(new Error('Timeout'))

      await expect(
        createSubscriptionPayment('club', 'monthly', 'a@b.com', 'Name', 'member-1', 'token_abc')
      ).rejects.toThrow('Timeout')
    })
  })
})
