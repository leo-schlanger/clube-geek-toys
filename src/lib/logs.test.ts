/**
 * Logs — Unit Tests
 *
 * Tests all exported functions in logs.ts:
 * - getMemberLogs
 * - getRecentLogs
 * - getErrorLogs
 * - getErrorStats
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
  getMemberLogs,
  getRecentLogs,
  getErrorLogs,
  getErrorStats,
} from './logs'
import type { AuditLog, ErrorLog, ErrorStats } from './logs'
import { api } from './api-client'

const mockedApi = vi.mocked(api)

beforeEach(() => {
  vi.clearAllMocks()
})

// =============================================================================
// getMemberLogs
// =============================================================================

describe('getMemberLogs', () => {
  it('should fetch audit logs for a member with default limit', async () => {
    const logs: AuditLog[] = [
      { id: 'log-1', action: 'login', member_id: 'm1', timestamp: '2026-01-01' },
    ]
    mockedApi.get.mockResolvedValueOnce({ data: logs, status: 200 })

    const result = await getMemberLogs('m1')

    expect(result).toEqual(logs)
    expect(mockedApi.get).toHaveBeenCalledWith('/logs/audit?memberId=m1&limit=20')
  })

  it('should use custom limit', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [], status: 200 })

    await getMemberLogs('m1', 5)

    expect(mockedApi.get).toHaveBeenCalledWith('/logs/audit?memberId=m1&limit=5')
  })

  it('should return empty array when no data', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: undefined, status: 404 })

    const result = await getMemberLogs('m1')

    expect(result).toEqual([])
  })
})

// =============================================================================
// getRecentLogs
// =============================================================================

describe('getRecentLogs', () => {
  it('should fetch recent audit logs with default limit', async () => {
    const logs: AuditLog[] = [
      { id: 'log-1', action: 'member_created', timestamp: '2026-01-01' },
      { id: 'log-2', action: 'payment_confirmed', timestamp: '2026-01-02' },
    ]
    mockedApi.get.mockResolvedValueOnce({ data: logs, status: 200 })

    const result = await getRecentLogs()

    expect(result).toEqual(logs)
    expect(mockedApi.get).toHaveBeenCalledWith('/logs/audit?limit=50')
  })

  it('should use custom limit', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [], status: 200 })

    await getRecentLogs(10)

    expect(mockedApi.get).toHaveBeenCalledWith('/logs/audit?limit=10')
  })

  it('should return empty array when no data', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: undefined, status: 200 })

    const result = await getRecentLogs()

    expect(result).toEqual([])
  })
})

// =============================================================================
// getErrorLogs
// =============================================================================

describe('getErrorLogs', () => {
  it('should fetch error logs with no filters', async () => {
    const logs: ErrorLog[] = [
      {
        id: 'err-1',
        severity: 'error',
        message: 'Payment failed',
        source: 'backend',
        createdAt: '2026-01-01',
      },
    ]
    mockedApi.get.mockResolvedValueOnce({ data: logs, status: 200 })

    const result = await getErrorLogs()

    expect(result).toEqual(logs)
    expect(mockedApi.get).toHaveBeenCalledWith('/logs/errors?')
  })

  it('should pass severity filter', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [], status: 200 })

    await getErrorLogs({ severity: 'fatal' })

    expect(mockedApi.get).toHaveBeenCalledWith('/logs/errors?severity=fatal')
  })

  it('should pass source filter', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [], status: 200 })

    await getErrorLogs({ source: 'frontend' })

    expect(mockedApi.get).toHaveBeenCalledWith('/logs/errors?source=frontend')
  })

  it('should pass limit filter', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [], status: 200 })

    await getErrorLogs({ limit: 10 })

    expect(mockedApi.get).toHaveBeenCalledWith('/logs/errors?limit=10')
  })

  it('should combine multiple filters', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [], status: 200 })

    await getErrorLogs({ severity: 'error', source: 'backend', limit: 25 })

    const calledUrl = mockedApi.get.mock.calls[0][0] as string
    expect(calledUrl).toContain('severity=error')
    expect(calledUrl).toContain('source=backend')
    expect(calledUrl).toContain('limit=25')
  })

  it('should return empty array when no data', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: undefined, status: 200 })

    const result = await getErrorLogs()

    expect(result).toEqual([])
  })
})

// =============================================================================
// getErrorStats
// =============================================================================

describe('getErrorStats', () => {
  it('should return error statistics', async () => {
    const stats: ErrorStats = {
      last_24h: '5',
      last_7d: '20',
      errors_24h: '3',
      fatal_24h: '1',
    }
    mockedApi.get.mockResolvedValueOnce({ data: stats, status: 200 })

    const result = await getErrorStats()

    expect(result).toEqual(stats)
    expect(mockedApi.get).toHaveBeenCalledWith('/logs/errors/stats')
  })

  it('should return defaults when no data', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: undefined, status: 500 })

    const result = await getErrorStats()

    expect(result).toEqual({
      last_24h: '0',
      last_7d: '0',
      errors_24h: '0',
      fatal_24h: '0',
    })
  })
})
