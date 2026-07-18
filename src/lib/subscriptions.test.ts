/**
 * Subscriptions — Unit Tests
 *
 * Tests all exported functions in subscriptions.ts:
 * - calculateSubscriptionPrice
 * - createSubscription, getSubscriptionFromApi, pauseSubscription,
 *   resumeSubscription, cancelSubscription, updateSubscriptionCard
 * - getSubscriptionById, getSubscriptionByMemberId, getActiveSubscriptionByMemberId,
 *   getSubscriptionPayments, getMemberSubscriptionPayments
 * - Status helpers: getSubscriptionStatusLabel, getSubscriptionStatusColor,
 *   getSubscriptionStatusBadge, getFrequencyLabel
 * - State checks: canPauseSubscription, canResumeSubscription,
 *   canCancelSubscription, canUpdateCard
 * - Display: formatCardDisplay, formatNextPaymentDate
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('./logger', () => ({
  paymentLogger: {
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}))

import {
  calculateSubscriptionPrice,
  createSubscription,
  getSubscriptionFromApi,
  pauseSubscription,
  resumeSubscription,
  cancelSubscription,
  updateSubscriptionCard,
  getSubscriptionById,
  getSubscriptionByMemberId,
  getActiveSubscriptionByMemberId,
  getSubscriptionPayments,
  getMemberSubscriptionPayments,
  getSubscriptionStatusLabel,
  getSubscriptionStatusColor,
  getSubscriptionStatusBadge,
  getFrequencyLabel,
  canPauseSubscription,
  canResumeSubscription,
  canCancelSubscription,
  canUpdateCard,
  formatCardDisplay,
  formatNextPaymentDate,
} from './subscriptions'
import { api } from './api-client'
import type { Subscription, SubscriptionPayment } from '../types'

const mockedApi = vi.mocked(api)

function makeSub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-1',
    memberId: 'member-1',
    providerId: 'stripe-sub-1',
    status: 'authorized',
    plan: 'club',
    frequencyType: 'years',
    transactionAmount: 149.99,
    failedPayments: 0,
    payerEmail: 'user@email.com',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// =============================================================================
// Price Calculations
// =============================================================================

describe('calculateSubscriptionPrice', () => {
  it('deve retornar o preço anual do clube (149.99)', () => {
    expect(calculateSubscriptionPrice('club', 'years')).toBe(149.99)
  })
})

// =============================================================================
// API Calls
// =============================================================================

describe('createSubscription', () => {
  const request = {
    memberId: 'member-1',
    plan: 'club' as const,
    frequencyType: 'years' as const,
    payerEmail: 'user@email.com',
    payerName: 'Joao',
    encryptedCard: 'enc-card',
  }

  it('should create subscription and return response', async () => {
    mockedApi.post.mockResolvedValueOnce({
      data: { id: 'sub-1', status: 'authorized', init_point: 'https://stripe.com/pay' },
      status: 201,
    })

    const result = await createSubscription(request)

    expect(result).toEqual({
      id: 'sub-1',
      status: 'authorized',
      initPoint: 'https://stripe.com/pay',
    })
    expect(mockedApi.post).toHaveBeenCalledWith('/subscription/create', {
      member_id: 'member-1',
      plan: 'club',
      frequency_type: 'years',
      payer_email: 'user@email.com',
      payer_name: 'Joao',
      transaction_amount: 149.99,
    })
  })

  it('should use "Cliente" as default payer name', async () => {
    mockedApi.post.mockResolvedValueOnce({
      data: { id: 'sub-1', status: 'pending' },
      status: 201,
    })

    await createSubscription({ ...request, payerName: '' })

    expect(mockedApi.post.mock.calls[0][1]!.payer_name).toBe('Cliente')
  })

  it('should return null on api error', async () => {
    mockedApi.post.mockResolvedValueOnce({ error: 'Bad request', status: 400 })

    const result = await createSubscription(request)

    expect(result).toBeNull()
  })

  it('should return null on empty data', async () => {
    mockedApi.post.mockResolvedValueOnce({ data: undefined, status: 200 })

    const result = await createSubscription(request)

    expect(result).toBeNull()
  })

  it('should return null on thrown error', async () => {
    mockedApi.post.mockRejectedValueOnce(new Error('Network'))

    const result = await createSubscription(request)

    expect(result).toBeNull()
  })
})

describe('getSubscriptionFromApi', () => {
  it('should return subscription data', async () => {
    const sub = makeSub()
    mockedApi.get.mockResolvedValueOnce({ data: sub, status: 200 })

    const result = await getSubscriptionFromApi('sub-1')

    expect(result).toEqual(sub)
    expect(mockedApi.get).toHaveBeenCalledWith('/subscription/sub-1')
  })

  it('should return null when no data', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: undefined, status: 404 })

    const result = await getSubscriptionFromApi('sub-1')

    expect(result).toBeNull()
  })

  it('should return null on thrown error', async () => {
    mockedApi.get.mockRejectedValueOnce(new Error('timeout'))

    const result = await getSubscriptionFromApi('sub-1')

    expect(result).toBeNull()
  })
})

describe('pauseSubscription', () => {
  it('should return true on success', async () => {
    mockedApi.put.mockResolvedValueOnce({ data: {}, status: 200 })

    const result = await pauseSubscription('sub-1')

    expect(result).toBe(true)
    expect(mockedApi.put).toHaveBeenCalledWith('/subscription/sub-1/pause')
  })

  it('should return false on error', async () => {
    mockedApi.put.mockResolvedValueOnce({ error: 'Cannot pause', status: 400 })

    const result = await pauseSubscription('sub-1')

    expect(result).toBe(false)
  })

  it('should return false on thrown error', async () => {
    mockedApi.put.mockRejectedValueOnce(new Error('Network'))

    const result = await pauseSubscription('sub-1')

    expect(result).toBe(false)
  })
})

describe('resumeSubscription', () => {
  it('should return true on success', async () => {
    mockedApi.put.mockResolvedValueOnce({ data: {}, status: 200 })

    expect(await resumeSubscription('sub-1')).toBe(true)
    expect(mockedApi.put).toHaveBeenCalledWith('/subscription/sub-1/resume')
  })

  it('should return false on error', async () => {
    mockedApi.put.mockResolvedValueOnce({ error: 'Cannot resume', status: 400 })

    expect(await resumeSubscription('sub-1')).toBe(false)
  })

  it('should return false on thrown error', async () => {
    mockedApi.put.mockRejectedValueOnce(new Error('fail'))

    expect(await resumeSubscription('sub-1')).toBe(false)
  })
})

describe('cancelSubscription', () => {
  it('should return true on success', async () => {
    mockedApi.put.mockResolvedValueOnce({ data: {}, status: 200 })

    expect(await cancelSubscription('sub-1')).toBe(true)
    expect(mockedApi.put).toHaveBeenCalledWith('/subscription/sub-1/cancel')
  })

  it('should return false on error', async () => {
    mockedApi.put.mockResolvedValueOnce({ error: 'Failed', status: 500 })

    expect(await cancelSubscription('sub-1')).toBe(false)
  })

  it('should return false on thrown error', async () => {
    mockedApi.put.mockRejectedValueOnce(new Error('fail'))

    expect(await cancelSubscription('sub-1')).toBe(false)
  })
})

describe('updateSubscriptionCard', () => {
  it('should return true on success', async () => {
    mockedApi.put.mockResolvedValueOnce({ data: {}, status: 200 })

    expect(await updateSubscriptionCard('sub-1', 'pm_abc')).toBe(true)
    expect(mockedApi.put).toHaveBeenCalledWith('/subscription/sub-1/update-payment-method', {
      paymentMethodId: 'pm_abc',
    })
  })

  it('should return false on error', async () => {
    mockedApi.put.mockResolvedValueOnce({ error: 'Invalid', status: 400 })

    expect(await updateSubscriptionCard('sub-1', 'pm_abc')).toBe(false)
  })

  it('should return false on thrown error', async () => {
    mockedApi.put.mockRejectedValueOnce(new Error('fail'))

    expect(await updateSubscriptionCard('sub-1', 'pm_abc')).toBe(false)
  })
})

// =============================================================================
// API Queries
// =============================================================================

describe('getSubscriptionById', () => {
  it('should delegate to getSubscriptionFromApi', async () => {
    const sub = makeSub()
    mockedApi.get.mockResolvedValueOnce({ data: sub, status: 200 })

    const result = await getSubscriptionById('sub-1')

    expect(result).toEqual(sub)
  })
})

describe('getSubscriptionByMemberId', () => {
  it('should fetch member then subscription', async () => {
    mockedApi.get
      .mockResolvedValueOnce({ data: { subscriptionId: 'sub-1' }, status: 200 })
      .mockResolvedValueOnce({ data: makeSub(), status: 200 })

    const result = await getSubscriptionByMemberId('member-1')

    expect(result).toBeDefined()
    expect(result!.id).toBe('sub-1')
    expect(mockedApi.get).toHaveBeenNthCalledWith(1, '/members/member-1')
    expect(mockedApi.get).toHaveBeenNthCalledWith(2, '/subscription/sub-1')
  })

  it('should return null when member has no subscriptionId', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: {}, status: 200 })

    const result = await getSubscriptionByMemberId('member-1')

    expect(result).toBeNull()
  })

  it('should return null when member data is missing', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: undefined, status: 404 })

    const result = await getSubscriptionByMemberId('member-1')

    expect(result).toBeNull()
  })

  it('should return null on thrown error', async () => {
    mockedApi.get.mockRejectedValueOnce(new Error('fail'))

    const result = await getSubscriptionByMemberId('member-1')

    expect(result).toBeNull()
  })
})

describe('getActiveSubscriptionByMemberId', () => {
  it('should return subscription when status is authorized', async () => {
    mockedApi.get
      .mockResolvedValueOnce({ data: { subscriptionId: 'sub-1' }, status: 200 })
      .mockResolvedValueOnce({ data: makeSub({ status: 'authorized' }), status: 200 })

    const result = await getActiveSubscriptionByMemberId('member-1')

    expect(result).toBeDefined()
    expect(result!.status).toBe('authorized')
  })

  it('should return subscription when status is pending', async () => {
    mockedApi.get
      .mockResolvedValueOnce({ data: { subscriptionId: 'sub-1' }, status: 200 })
      .mockResolvedValueOnce({ data: makeSub({ status: 'pending' }), status: 200 })

    const result = await getActiveSubscriptionByMemberId('member-1')

    expect(result).toBeDefined()
    expect(result!.status).toBe('pending')
  })

  it('should return null when status is cancelled', async () => {
    mockedApi.get
      .mockResolvedValueOnce({ data: { subscriptionId: 'sub-1' }, status: 200 })
      .mockResolvedValueOnce({ data: makeSub({ status: 'cancelled' }), status: 200 })

    const result = await getActiveSubscriptionByMemberId('member-1')

    expect(result).toBeNull()
  })

  it('should return null when status is paused', async () => {
    mockedApi.get
      .mockResolvedValueOnce({ data: { subscriptionId: 'sub-1' }, status: 200 })
      .mockResolvedValueOnce({ data: makeSub({ status: 'paused' }), status: 200 })

    const result = await getActiveSubscriptionByMemberId('member-1')

    expect(result).toBeNull()
  })

  it('should return null when no subscription found', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: {}, status: 200 })

    const result = await getActiveSubscriptionByMemberId('member-1')

    expect(result).toBeNull()
  })
})

describe('getSubscriptionPayments', () => {
  it('should return payment array', async () => {
    const payments: SubscriptionPayment[] = [
      {
        id: 'pay-1',
        subscriptionId: 'sub-1',
        memberId: 'member-1',
        amount: 39.90,
        status: 'approved',
        paymentDate: '2026-01-01',
        providerPaymentId: 'pi_1',
      },
    ]
    mockedApi.get.mockResolvedValueOnce({ data: payments, status: 200 })

    const result = await getSubscriptionPayments('sub-1')

    expect(result).toHaveLength(1)
    expect(mockedApi.get).toHaveBeenCalledWith('/subscription/sub-1/payments?limit=20')
  })

  it('should use custom limit', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [], status: 200 })

    await getSubscriptionPayments('sub-1', 5)

    expect(mockedApi.get).toHaveBeenCalledWith('/subscription/sub-1/payments?limit=5')
  })

  it('should return empty array on failure', async () => {
    mockedApi.get.mockRejectedValueOnce(new Error('fail'))

    const result = await getSubscriptionPayments('sub-1')

    expect(result).toEqual([])
  })
})

describe('getMemberSubscriptionPayments', () => {
  it('should fetch member subscription then payments', async () => {
    mockedApi.get
      .mockResolvedValueOnce({ data: { subscriptionId: 'sub-1' }, status: 200 }) // member
      .mockResolvedValueOnce({ data: makeSub(), status: 200 }) // subscription
      .mockResolvedValueOnce({ data: [], status: 200 }) // payments

    const result = await getMemberSubscriptionPayments('member-1')

    expect(result).toEqual([])
    expect(mockedApi.get).toHaveBeenCalledTimes(3)
  })

  it('should return empty array when no subscription', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: {}, status: 200 })

    const result = await getMemberSubscriptionPayments('member-1')

    expect(result).toEqual([])
  })
})

// =============================================================================
// Status Helpers
// =============================================================================

describe('getSubscriptionStatusLabel', () => {
  it('should return correct labels', () => {
    expect(getSubscriptionStatusLabel('pending')).toBe('Pendente')
    expect(getSubscriptionStatusLabel('authorized')).toBe('Ativa')
    expect(getSubscriptionStatusLabel('paused')).toBe('Pausada')
    expect(getSubscriptionStatusLabel('cancelled')).toBe('Cancelada')
  })

  it('should return raw status for unknown value', () => {
    expect(getSubscriptionStatusLabel('unknown' as never)).toBe('unknown')
  })
})

describe('getSubscriptionStatusColor', () => {
  it('should return correct CSS classes', () => {
    expect(getSubscriptionStatusColor('pending')).toBe('text-yellow-500')
    expect(getSubscriptionStatusColor('authorized')).toBe('text-green-500')
    expect(getSubscriptionStatusColor('paused')).toBe('text-orange-500')
    expect(getSubscriptionStatusColor('cancelled')).toBe('text-red-500')
  })

  it('should return gray for unknown status', () => {
    expect(getSubscriptionStatusColor('unknown' as never)).toBe('text-gray-500')
  })
})

describe('getSubscriptionStatusBadge', () => {
  it('should return correct badge variants', () => {
    expect(getSubscriptionStatusBadge('pending')).toBe('warning')
    expect(getSubscriptionStatusBadge('authorized')).toBe('success')
    expect(getSubscriptionStatusBadge('paused')).toBe('warning')
    expect(getSubscriptionStatusBadge('cancelled')).toBe('destructive')
  })

  it('should return default for unknown status', () => {
    expect(getSubscriptionStatusBadge('unknown' as never)).toBe('default')
  })
})

describe('getFrequencyLabel', () => {
  it('should return Mensal for months', () => {
    expect(getFrequencyLabel('months')).toBe('Mensal')
  })

  it('should return Anual for years', () => {
    expect(getFrequencyLabel('years')).toBe('Anual')
  })
})

// =============================================================================
// State Checks
// =============================================================================

describe('canPauseSubscription', () => {
  it('should return true when authorized', () => {
    expect(canPauseSubscription(makeSub({ status: 'authorized' }))).toBe(true)
  })

  it('should return false when not authorized', () => {
    expect(canPauseSubscription(makeSub({ status: 'paused' }))).toBe(false)
    expect(canPauseSubscription(makeSub({ status: 'cancelled' }))).toBe(false)
    expect(canPauseSubscription(makeSub({ status: 'pending' }))).toBe(false)
  })
})

describe('canResumeSubscription', () => {
  it('should return true when paused', () => {
    expect(canResumeSubscription(makeSub({ status: 'paused' }))).toBe(true)
  })

  it('should return false when not paused', () => {
    expect(canResumeSubscription(makeSub({ status: 'authorized' }))).toBe(false)
    expect(canResumeSubscription(makeSub({ status: 'cancelled' }))).toBe(false)
  })
})

describe('canCancelSubscription', () => {
  it('should return true when authorized or paused', () => {
    expect(canCancelSubscription(makeSub({ status: 'authorized' }))).toBe(true)
    expect(canCancelSubscription(makeSub({ status: 'paused' }))).toBe(true)
  })

  it('should return false when cancelled or pending', () => {
    expect(canCancelSubscription(makeSub({ status: 'cancelled' }))).toBe(false)
    expect(canCancelSubscription(makeSub({ status: 'pending' }))).toBe(false)
  })
})

describe('canUpdateCard', () => {
  it('should return true when authorized or paused', () => {
    expect(canUpdateCard(makeSub({ status: 'authorized' }))).toBe(true)
    expect(canUpdateCard(makeSub({ status: 'paused' }))).toBe(true)
  })

  it('should return false when cancelled or pending', () => {
    expect(canUpdateCard(makeSub({ status: 'cancelled' }))).toBe(false)
    expect(canUpdateCard(makeSub({ status: 'pending' }))).toBe(false)
  })
})

// =============================================================================
// Display Helpers
// =============================================================================

describe('formatCardDisplay', () => {
  it('should format card with brand and last four', () => {
    expect(formatCardDisplay(makeSub({ cardLastFour: '4242', cardBrand: 'Visa' }))).toBe(
      'Visa **** 4242'
    )
  })

  it('should use generic label when no brand', () => {
    expect(formatCardDisplay(makeSub({ cardLastFour: '1234' }))).toBe('Cartão **** 1234')
  })

  it('should return placeholder when no card info', () => {
    expect(formatCardDisplay(makeSub())).toBe('Cartão não registrado')
  })
})

describe('formatNextPaymentDate', () => {
  it('should format date in pt-BR locale', () => {
    const result = formatNextPaymentDate(makeSub({ nextPaymentDate: '2026-02-15' }))
    // pt-BR format: dd/mm/yyyy
    expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/)
  })

  it('should return placeholder when no date', () => {
    expect(formatNextPaymentDate(makeSub())).toBe('Não definida')
  })
})
