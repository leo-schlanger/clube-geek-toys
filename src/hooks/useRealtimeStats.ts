import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api-client'

export interface RealtimeStats {
  totalMembers: number
  activeMembers: number
  pendingMembers: number
  expiredMembers: number
  monthlyRevenue: number
  todayRevenue: number
  newMembersToday: number
  newMembersThisWeek: number
}

export interface StatsTrend {
  direction: 'up' | 'down' | 'stable'
  percentage: number
}

export interface RealtimeStatsResult {
  stats: RealtimeStats
  previousStats: RealtimeStats | null
  trends: {
    totalMembers: StatsTrend
    activeMembers: StatsTrend
    monthlyRevenue: StatsTrend
    todayRevenue: StatsTrend
  }
  loading: boolean
  error: string | null
  lastUpdate: Date | null
}

const initialStats: RealtimeStats = {
  totalMembers: 0,
  activeMembers: 0,
  pendingMembers: 0,
  expiredMembers: 0,
  monthlyRevenue: 0,
  todayRevenue: 0,
  newMembersToday: 0,
  newMembersThisWeek: 0,
}

function calculateTrend(current: number, previous: number): StatsTrend {
  if (previous === 0) {
    return { direction: current > 0 ? 'up' : 'stable', percentage: 0 }
  }
  const percentage = ((current - previous) / previous) * 100
  if (Math.abs(percentage) < 0.5) {
    return { direction: 'stable', percentage: 0 }
  }
  return {
    direction: percentage > 0 ? 'up' : 'down',
    percentage: Math.abs(Math.round(percentage * 10) / 10),
  }
}

const POLL_INTERVAL = 30000 // 30 seconds

/**
 * Hook for dashboard statistics — polls API every 30 seconds
 */
export function useRealtimeStats(): RealtimeStatsResult {
  const [stats, setStats] = useState<RealtimeStats>(initialStats)
  const [previousStats, setPreviousStats] = useState<RealtimeStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const previousStatsRef = useRef<RealtimeStats | null>(null)

  useEffect(() => {
    let isMounted = true

    async function fetchStats() {
      try {
        const result = await api.get('/reports/realtime-stats')

        if (!isMounted) return

        if (result.error) {
          setError(result.error)
          setLoading(false)
          return
        }

        const data = (result.data ?? {}) as {
          members?: Record<string, number>
          payments?: Record<string, number>
        }
        const members = data.members || {}
        const payments = data.payments || {}

        const newStats: RealtimeStats = {
          totalMembers: members.total || 0,
          activeMembers: members.active || 0,
          pendingMembers: members.pending || 0,
          expiredMembers: (members.expired || 0) + (members.inactive || 0),
          monthlyRevenue: payments.month_revenue || 0,
          todayRevenue: payments.today_revenue || 0,
          newMembersToday: members.new_today || 0,
          newMembersThisWeek: members.new_this_week || 0,
        }

        if (previousStatsRef.current) {
          setPreviousStats(previousStatsRef.current)
        }
        previousStatsRef.current = stats

        setStats(newStats)
        setLastUpdate(new Date())
        setError(null)
        setLoading(false)
      } catch {
        if (isMounted) {
          setError('Erro ao carregar estatísticas')
          setLoading(false)
        }
      }
    }

    // Initial fetch
    fetchStats()

    // Poll every 30 seconds
    const interval = setInterval(fetchStats, POLL_INTERVAL)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const trends = {
    totalMembers: calculateTrend(stats.totalMembers, previousStats?.totalMembers ?? stats.totalMembers),
    activeMembers: calculateTrend(stats.activeMembers, previousStats?.activeMembers ?? stats.activeMembers),
    monthlyRevenue: calculateTrend(stats.monthlyRevenue, previousStats?.monthlyRevenue ?? stats.monthlyRevenue),
    todayRevenue: calculateTrend(stats.todayRevenue, previousStats?.todayRevenue ?? stats.todayRevenue),
  }

  return {
    stats,
    previousStats,
    trends,
    loading,
    error,
    lastUpdate,
  }
}
