import { useState, useEffect, useRef } from 'react'
import {
  collection,
  query,
  where,
  onSnapshot,
  Timestamp,
  orderBy,
  limit,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { COLLECTIONS } from '../lib/constants'
import { PLANS, type PlanType } from '../types'
import { firestoreLogger } from '../lib/logger'

export interface RealtimeStats {
  totalMembers: number
  activeMembers: number
  pendingMembers: number
  expiredMembers: number
  monthlyRevenue: number
  todayRevenue: number
  membersByPlan: {
    silver: number
    gold: number
    black: number
  }
  newMembersToday: number
  newMembersThisWeek: number
  pointsEarnedToday: number
  pointsRedeemedToday: number
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
  membersByPlan: { silver: 0, gold: 0, black: 0 },
  newMembersToday: 0,
  newMembersThisWeek: 0,
  pointsEarnedToday: 0,
  pointsRedeemedToday: 0,
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

function getStartOfDay(): Date {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now
}

function getStartOfWeek(): Date {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
  now.setDate(diff)
  now.setHours(0, 0, 0, 0)
  return now
}

function getStartOfMonth(): Date {
  const now = new Date()
  now.setDate(1)
  now.setHours(0, 0, 0, 0)
  return now
}

/**
 * Hook for real-time dashboard statistics using Firestore onSnapshot
 * Updates automatically when data changes in Firestore
 */
export function useRealtimeStats(): RealtimeStatsResult {
  const [stats, setStats] = useState<RealtimeStats>(initialStats)
  const [previousStats, setPreviousStats] = useState<RealtimeStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  // Store previous stats for trend calculation
  const previousStatsRef = useRef<RealtimeStats | null>(null)

  useEffect(() => {
    const unsubscribers: (() => void)[] = []

    // Accumulated data from different listeners
    let membersData: {
      status: string
      plan: string
      paymentType: string
      createdAt: string
      expiryDate: string
    }[] = []
    let paymentsData: { amount: number; paidAt: string }[] = []
    let pointsData: { type: string; points: number }[] = []

    const updateStats = () => {
      const now = new Date()
      const startOfDay = getStartOfDay()
      const startOfWeek = getStartOfWeek()

      // Calculate member stats
      const totalMembers = membersData.length
      const activeMembers = membersData.filter(
        (m) => m.status === 'active' && new Date(m.expiryDate) > now
      ).length
      const pendingMembers = membersData.filter((m) => m.status === 'pending').length
      const expiredMembers = membersData.filter(
        (m) => m.status === 'expired' || new Date(m.expiryDate) <= now
      ).length

      // Members by plan
      const membersByPlan = { silver: 0, gold: 0, black: 0 }
      membersData.forEach((m) => {
        if (m.plan in membersByPlan) {
          membersByPlan[m.plan as keyof typeof membersByPlan]++
        }
      })

      // New members today/this week
      const newMembersToday = membersData.filter(
        (m) => new Date(m.createdAt) >= startOfDay
      ).length
      const newMembersThisWeek = membersData.filter(
        (m) => new Date(m.createdAt) >= startOfWeek
      ).length

      // Calculate monthly revenue (projected based on active members)
      let monthlyRevenue = 0
      membersData
        .filter((m) => m.status === 'active')
        .forEach((m) => {
          const plan = PLANS[m.plan as PlanType]
          if (plan) {
            if (m.paymentType === 'monthly') {
              monthlyRevenue += plan.priceMonthly
            } else {
              monthlyRevenue += plan.priceAnnual / 12
            }
          }
        })

      // Calculate today's revenue from payments
      const todayRevenue = paymentsData
        .filter((p) => new Date(p.paidAt) >= startOfDay)
        .reduce((sum, p) => sum + p.amount, 0)

      // Calculate today's points
      const pointsEarnedToday = pointsData
        .filter((p) => p.type === 'earn')
        .reduce((sum, p) => sum + p.points, 0)
      const pointsRedeemedToday = pointsData
        .filter((p) => p.type === 'redeem')
        .reduce((sum, p) => sum + Math.abs(p.points), 0)

      const newStats: RealtimeStats = {
        totalMembers,
        activeMembers,
        pendingMembers,
        expiredMembers,
        monthlyRevenue,
        todayRevenue,
        membersByPlan,
        newMembersToday,
        newMembersThisWeek,
        pointsEarnedToday,
        pointsRedeemedToday,
      }

      // Update previous stats for trend calculation
      if (previousStatsRef.current) {
        setPreviousStats(previousStatsRef.current)
      }
      previousStatsRef.current = stats

      setStats(newStats)
      setLastUpdate(new Date())
      setLoading(false)
    }

    try {
      // Listen to members collection
      const membersRef = collection(db, COLLECTIONS.MEMBERS)
      const membersQuery = query(membersRef, orderBy('created_at', 'desc'), limit(1000))

      const unsubMembers = onSnapshot(
        membersQuery,
        (snapshot) => {
          membersData = snapshot.docs.map((doc) => {
            const data = doc.data()
            return {
              status: data.status || 'pending',
              plan: data.plan || 'silver',
              paymentType: data.payment_type || 'monthly',
              createdAt: data.created_at instanceof Timestamp
                ? data.created_at.toDate().toISOString()
                : data.created_at || new Date().toISOString(),
              expiryDate: data.expiry_date || new Date().toISOString(),
            }
          })
          updateStats()
        },
        (err) => {
          firestoreLogger.error('Members listener error:', err)
          setError('Erro ao carregar membros')
        }
      )
      unsubscribers.push(unsubMembers)

      // Listen to payments from this month
      const paymentsRef = collection(db, COLLECTIONS.PAYMENTS)
      const startOfMonth = getStartOfMonth()
      const paymentsQuery = query(
        paymentsRef,
        where('status', '==', 'paid'),
        where('paid_at', '>=', startOfMonth.toISOString()),
        orderBy('paid_at', 'desc'),
        limit(500)
      )

      const unsubPayments = onSnapshot(
        paymentsQuery,
        (snapshot) => {
          paymentsData = snapshot.docs.map((doc) => {
            const data = doc.data()
            return {
              amount: data.amount || 0,
              paidAt: data.paid_at instanceof Timestamp
                ? data.paid_at.toDate().toISOString()
                : data.paid_at || new Date().toISOString(),
            }
          })
          updateStats()
        },
        (err) => {
          firestoreLogger.error('Payments listener error:', err)
          // Don't set error for payments, members are more important
        }
      )
      unsubscribers.push(unsubPayments)

      // Listen to point transactions from today
      const pointsRef = collection(db, COLLECTIONS.POINTS)
      const startOfDay = getStartOfDay()
      const pointsQuery = query(
        pointsRef,
        where('created_at', '>=', startOfDay.toISOString()),
        orderBy('created_at', 'desc'),
        limit(200)
      )

      const unsubPoints = onSnapshot(
        pointsQuery,
        (snapshot) => {
          pointsData = snapshot.docs.map((doc) => {
            const data = doc.data()
            return {
              type: data.type || 'earn',
              points: data.points || 0,
            }
          })
          updateStats()
        },
        (err) => {
          firestoreLogger.error('Points listener error:', err)
          // Don't set error for points
        }
      )
      unsubscribers.push(unsubPoints)

    } catch (err) {
      firestoreLogger.error('Error setting up realtime listeners:', err)
      setError('Erro ao iniciar monitoramento em tempo real')
      setLoading(false)
    }

    // Cleanup listeners on unmount
    return () => {
      unsubscribers.forEach((unsub) => unsub())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Intentionally empty - setup listeners only once on mount

  // Calculate trends
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
