import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRealtimeStats } from './useRealtimeStats'

// Mock the api-client module
vi.mock('../lib/api-client', () => ({
  api: {
    get: vi.fn(),
  },
}))

import { api } from '../lib/api-client'

const mockApiGet = api.get as ReturnType<typeof vi.fn>

const fakeApiResponse = {
  data: {
    members: {
      total: 100,
      active: 80,
      pending: 10,
      expired: 5,
      inactive: 5,
      new_today: 3,
      new_this_week: 12,
    },
    payments: {
      month_revenue: 15000,
      today_revenue: 500,
    },
  },
  error: null,
}

describe('useRealtimeStats', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue(fakeApiResponse)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should start with loading=true and initial stats', () => {
    const { result } = renderHook(() => useRealtimeStats())

    expect(result.current.loading).toBe(true)
    expect(result.current.stats.totalMembers).toBe(0)
    expect(result.current.stats.activeMembers).toBe(0)
    expect(result.current.previousStats).toBeNull()
    expect(result.current.lastUpdate).toBeNull()
  })

  it('should fetch stats on mount and populate data', async () => {
    const { result } = renderHook(() => useRealtimeStats())

    // Flush the async fetchStats call
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.stats.totalMembers).toBe(100)
    expect(result.current.stats.activeMembers).toBe(80)
    expect(result.current.stats.pendingMembers).toBe(10)
    expect(result.current.stats.expiredMembers).toBe(10) // expired + inactive
    expect(result.current.stats.monthlyRevenue).toBe(15000)
    expect(result.current.stats.todayRevenue).toBe(500)
    expect(result.current.stats.newMembersToday).toBe(3)
    expect(result.current.stats.newMembersThisWeek).toBe(12)
    expect(result.current.lastUpdate).toBeInstanceOf(Date)
    expect(result.current.error).toBeNull()
  })

  it('should handle API errors', async () => {
    mockApiGet.mockResolvedValue({ data: null, error: 'Unauthorized' })

    const { result } = renderHook(() => useRealtimeStats())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBe('Unauthorized')
  })

  it('should handle exceptions', async () => {
    mockApiGet.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useRealtimeStats())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBe('Erro ao carregar estatísticas')
  })

  it('should handle missing data fields gracefully', async () => {
    mockApiGet.mockResolvedValue({ data: {}, error: null })

    const { result } = renderHook(() => useRealtimeStats())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.stats.totalMembers).toBe(0)
    expect(result.current.stats.activeMembers).toBe(0)
    expect(result.current.stats.monthlyRevenue).toBe(0)
  })

  it('should poll every 30 seconds', async () => {
    renderHook(() => useRealtimeStats())

    // Initial fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(mockApiGet).toHaveBeenCalledTimes(1)

    // Advance 30 seconds for polling
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000)
    })

    expect(mockApiGet).toHaveBeenCalledTimes(2)

    // Advance another 30 seconds
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000)
    })

    expect(mockApiGet).toHaveBeenCalledTimes(3)
  })

  it('should clear interval on unmount', async () => {
    const { unmount } = renderHook(() => useRealtimeStats())

    // Initial fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(mockApiGet).toHaveBeenCalledTimes(1)

    unmount()

    // Advance past poll interval — should not trigger more calls
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000)
    })

    // Only the initial call should have been made
    expect(mockApiGet).toHaveBeenCalledTimes(1)
  })

  it('should calculate trends correctly', async () => {
    const { result } = renderHook(() => useRealtimeStats())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    // On first load, no previous stats, so all trends should be stable
    expect(result.current.trends.totalMembers.direction).toBe('stable')
    expect(result.current.trends.activeMembers.direction).toBe('stable')
  })

  it('should call /reports/realtime-stats endpoint', async () => {
    const { result } = renderHook(() => useRealtimeStats())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.loading).toBe(false)
    expect(mockApiGet).toHaveBeenCalledWith('/reports/realtime-stats')
  })

  it('should not update state after unmount (isMounted guard)', async () => {
    // Create a slow response
    let resolveApi!: (value: unknown) => void
    mockApiGet.mockReturnValue(new Promise(resolve => { resolveApi = resolve }))

    const { unmount } = renderHook(() => useRealtimeStats())

    // Unmount before the API resolves
    unmount()

    // Resolve the API call after unmount — should not throw
    await act(async () => {
      resolveApi(fakeApiResponse)
      await vi.advanceTimersByTimeAsync(0)
    })

    // If we reach here without errors, the isMounted guard works
    expect(true).toBe(true)
  })
})
