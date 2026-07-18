/**
 * Reports — Unit Tests
 *
 * Tests all exported functions in reports.ts:
 * - getMonthlyReport
 * - getRevenueByPlan
 * - getChurnRate
 * - getMemberStats
 * - calculateGrowthRate
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

import {
  getMonthlyReport,
  getRevenueByPlan,
  getChurnRate,
  getMemberStats,
  calculateGrowthRate,
} from './reports'
import { api } from './api-client'

const mockedApi = vi.mocked(api)

beforeEach(() => {
  vi.clearAllMocks()
})

// =============================================================================
// getMonthlyReport
// =============================================================================

describe('getMonthlyReport', () => {
  it('should return mapped monthly report data', async () => {
    const rawData = [
      {
        month: '2026-01',
        revenue: 1500,
        newMembers: 10,
        churnedMembers: 2,
      },
      {
        month: '2026-02',
        revenue: 1800,
        newMembers: 15,
        churnedMembers: 1,
      },
    ]
    mockedApi.get.mockResolvedValueOnce({ data: rawData, status: 200 })

    const result = await getMonthlyReport()

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      period: '2026-01',
      month: '2026-01',
      revenue: 1500,
      newMembers: 10,
      churnedMembers: 2,
    })
    expect(mockedApi.get).toHaveBeenCalledWith('/reports/monthly?months=6')
  })

  it('should use custom months parameter', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [], status: 200 })

    await getMonthlyReport(12)

    expect(mockedApi.get).toHaveBeenCalledWith('/reports/monthly?months=12')
  })

  it('should return empty array on error', async () => {
    mockedApi.get.mockResolvedValueOnce({ error: 'Server error', status: 500 })

    const result = await getMonthlyReport()

    expect(result).toEqual([])
  })

  it('should return empty array when no data', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: undefined, status: 200 })

    const result = await getMonthlyReport()

    expect(result).toEqual([])
  })

  it('should default missing numeric fields to 0', async () => {
    mockedApi.get.mockResolvedValueOnce({
      data: [{ month: '2026-03', revenue: 500 }],
      status: 200,
    })

    const result = await getMonthlyReport()

    expect(result[0].newMembers).toBe(0)
    expect(result[0].churnedMembers).toBe(0)
  })
})

// =============================================================================
// getRevenueByPlan
// =============================================================================

describe('getRevenueByPlan', () => {
  it('deve retornar distribuição única do plano club com 100%', async () => {
    mockedApi.get.mockResolvedValueOnce({
      data: {
        members: { total: 100 },
      },
      status: 200,
    })

    const result = await getRevenueByPlan()

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ plan: 'club', count: 100, revenue: 0, percentage: 100 })
  })

  it('deve tratar zero membros (percentual 0)', async () => {
    mockedApi.get.mockResolvedValueOnce({
      data: { members: { total: 0 } },
      status: 200,
    })

    const result = await getRevenueByPlan()

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ plan: 'club', count: 0, revenue: 0, percentage: 0 })
  })

  it('deve usar 0 quando o total está ausente', async () => {
    mockedApi.get.mockResolvedValueOnce({
      data: { members: {} },
      status: 200,
    })

    const result = await getRevenueByPlan()

    expect(result[0].count).toBe(0)
    expect(result[0].percentage).toBe(0)
  })

  it('should return empty array on error', async () => {
    mockedApi.get.mockResolvedValueOnce({ error: 'fail', status: 500 })

    const result = await getRevenueByPlan()

    expect(result).toEqual([])
  })

  it('should return empty array when no data', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: undefined, status: 200 })

    const result = await getRevenueByPlan()

    expect(result).toEqual([])
  })
})

// =============================================================================
// getChurnRate
// =============================================================================

describe('getChurnRate', () => {
  it('should return churn data', async () => {
    const churn = [
      { period: '2026-01', churnRate: 5, churned: 2, total: 40 },
    ]
    mockedApi.get.mockResolvedValueOnce({ data: churn, status: 200 })

    const result = await getChurnRate()

    expect(result).toEqual(churn)
    expect(mockedApi.get).toHaveBeenCalledWith('/reports/churn')
  })

  it('should return empty array on no data', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: undefined, status: 200 })

    const result = await getChurnRate()

    expect(result).toEqual([])
  })

  it('should return empty array on thrown error', async () => {
    mockedApi.get.mockRejectedValueOnce(new Error('fail'))

    const result = await getChurnRate()

    expect(result).toEqual([])
  })
})

// =============================================================================
// getMemberStats
// =============================================================================

describe('getMemberStats', () => {
  it('should return member statistics from realtime-stats', async () => {
    mockedApi.get.mockResolvedValueOnce({
      data: {
        members: {
          total: 100,
          active: 80,
          pending: 10,
          expired: 10,
        },
      },
      status: 200,
    })

    const result = await getMemberStats()

    expect(result).toEqual({
      total: 100,
      active: 80,
      pending: 10,
      expired: 10,
      byPlan: { club: 100 },
    })
    expect(mockedApi.get).toHaveBeenCalledWith('/reports/realtime-stats')
  })

  it('should return defaults when no data', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: undefined, status: 500 })

    const result = await getMemberStats()

    expect(result).toEqual({
      total: 0,
      active: 0,
      pending: 0,
      expired: 0,
      byPlan: { club: 0 },
    })
  })

  it('should return defaults on api error', async () => {
    mockedApi.get.mockResolvedValueOnce({ error: 'fail', status: 500 })

    const result = await getMemberStats()

    expect(result).toEqual({
      total: 0,
      active: 0,
      pending: 0,
      expired: 0,
      byPlan: { club: 0 },
    })
  })

  it('should default missing member fields to 0', async () => {
    mockedApi.get.mockResolvedValueOnce({
      data: { members: {} },
      status: 200,
    })

    const result = await getMemberStats()

    expect(result.total).toBe(0)
    expect(result.active).toBe(0)
    expect(result.byPlan.club).toBe(0)
  })
})

// =============================================================================
// calculateGrowthRate
// =============================================================================

describe('calculateGrowthRate', () => {
  it('should calculate positive growth', () => {
    expect(calculateGrowthRate(150, 100)).toBe(50)
  })

  it('should calculate negative growth', () => {
    expect(calculateGrowthRate(80, 100)).toBe(-20)
  })

  it('should return 0 when both are 0', () => {
    expect(calculateGrowthRate(0, 0)).toBe(0)
  })

  it('should return 100 when previous is 0 and current is positive', () => {
    expect(calculateGrowthRate(50, 0)).toBe(100)
  })

  it('should return 0 when current is 0 and previous is 0', () => {
    expect(calculateGrowthRate(0, 0)).toBe(0)
  })

  it('should handle decimal precision', () => {
    // 33.333... should be rounded to one decimal
    const result = calculateGrowthRate(400, 300)
    expect(result).toBe(33.3)
  })

  it('should return -100 when current is 0 and previous is positive', () => {
    expect(calculateGrowthRate(0, 100)).toBe(-100)
  })
})
