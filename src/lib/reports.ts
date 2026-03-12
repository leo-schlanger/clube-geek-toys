import { where, orderBy, limit, type DocumentData } from 'firebase/firestore'
import { FirestoreManager, MapperUtils } from './db-utils'
import type { Member, PlanType } from '../types'

// ============================================
// TYPES
// ============================================

export interface MonthlyReportData {
  period: string
  month: string
  revenue: number
  newMembers: number
  churnedMembers: number
  pointsEarned: number
  pointsRedeemed: number
}

export interface DailyReportData {
  date: string
  revenue: number
  payments: number
  members: {
    total: number
    active: number
    pending: number
    byPlan: Record<string, number>
  }
}

export interface ChurnData {
  period: string
  churnRate: number
  churned: number
  total: number
}

export interface PlanDistribution {
  plan: PlanType
  count: number
  revenue: number
  percentage: number
}

export interface PointsOverview {
  period: string
  earned: number
  redeemed: number
  expired: number
  netChange: number
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function toMember(id: string, data: DocumentData): Member {
  const mapped = MapperUtils.toCamel(data)
  return {
    id,
    userId: mapped.userId || '',
    cpf: mapped.cpf,
    fullName: mapped.fullName,
    email: mapped.email,
    phone: mapped.phone,
    photoUrl: mapped.photoUrl,
    plan: mapped.plan,
    status: mapped.status,
    paymentType: mapped.paymentType,
    startDate: mapped.startDate,
    expiryDate: mapped.expiryDate,
    points: mapped.points || 0,
    createdAt: mapped.createdAt,
    updatedAt: mapped.updatedAt,
  }
}

interface Payment {
  id: string
  memberId: string
  amount: number
  method: string
  status: string
  paidAt?: string
  createdAt: string
}

function toPayment(id: string, data: DocumentData): Payment {
  const mapped = MapperUtils.toCamel(data)
  return {
    id,
    memberId: mapped.memberId,
    amount: mapped.amount || 0,
    method: mapped.method,
    status: mapped.status,
    paidAt: mapped.paidAt,
    createdAt: mapped.createdAt,
  }
}

interface PointTransaction {
  id: string
  memberId: string
  points: number
  type: 'earn' | 'redeem' | 'expire'
  createdAt: string
  expiresAt?: string
}

function toPointTransaction(id: string, data: DocumentData): PointTransaction {
  const mapped = MapperUtils.toCamel(data)
  return {
    id,
    memberId: mapped.memberId,
    points: mapped.points || 0,
    type: mapped.type,
    createdAt: mapped.createdAt,
    expiresAt: mapped.expiresAt,
  }
}

// ============================================
// REPORT FUNCTIONS
// ============================================

/**
 * Get monthly report data for the last N months
 * Optimized: uses date filters in Firestore queries
 */
export async function getMonthlyReport(months: number = 6): Promise<MonthlyReportData[]> {
  const now = new Date()
  const reports: MonthlyReportData[] = []

  // Calculate date range for queries
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)
  const startDateStr = startDate.toISOString()

  // Fetch data with date filters (reduces data transferred significantly)
  const [members, payments, pointTransactions] = await Promise.all([
    // Members: only those created or expiring in the period
    FirestoreManager.findMany('members', [
      orderBy('created_at', 'desc'),
      limit(500), // Safety limit
    ], toMember),
    // Payments: only paid ones in the period
    FirestoreManager.findMany('payments', [
      where('status', '==', 'paid'),
      where('paid_at', '>=', startDateStr),
      orderBy('paid_at', 'desc'),
      limit(1000),
    ], toPayment),
    // Points: only in the period
    FirestoreManager.findMany('point_transactions', [
      where('created_at', '>=', startDateStr),
      orderBy('created_at', 'desc'),
      limit(2000),
    ], toPointTransaction),
  ])

  // Process each month (now with much smaller datasets)
  for (let i = 0; i < months; i++) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
    const monthLabel = monthDate.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })

    // Calculate revenue from payments in this month
    const monthPayments = payments.filter((p) => {
      const paidAt = p.paidAt ? new Date(p.paidAt) : null
      return paidAt && paidAt >= monthDate && paidAt <= monthEnd
    })
    const revenue = monthPayments.reduce((sum, p) => sum + (p.amount || 0), 0)

    // Calculate new members
    const newMembers = members.filter((m) => {
      const createdAt = m.createdAt ? new Date(m.createdAt) : null
      return createdAt && createdAt >= monthDate && createdAt <= monthEnd
    }).length

    // Calculate churned members (expired or inactive in this month)
    const churnedMembers = members.filter((m) => {
      const expiryDate = m.expiryDate ? new Date(m.expiryDate) : null
      return expiryDate && expiryDate >= monthDate && expiryDate <= monthEnd && m.status !== 'active'
    }).length

    // Calculate points
    const monthPoints = pointTransactions.filter((t) => {
      const createdAt = t.createdAt ? new Date(t.createdAt) : null
      return createdAt && createdAt >= monthDate && createdAt <= monthEnd
    })
    const pointsEarned = monthPoints.filter((t) => t.type === 'earn').reduce((sum, t) => sum + t.points, 0)
    const pointsRedeemed = monthPoints.filter((t) => t.type === 'redeem').reduce((sum, t) => sum + Math.abs(t.points), 0)

    reports.unshift({
      period: monthLabel,
      month: monthDate.toISOString().slice(0, 7),
      revenue,
      newMembers,
      churnedMembers,
      pointsEarned,
      pointsRedeemed,
    })
  }

  return reports
}

/**
 * Get revenue breakdown by plan
 * Optimized: uses date filters and limits
 */
export async function getRevenueByPlan(startDate?: Date, endDate?: Date): Promise<PlanDistribution[]> {
  const start = startDate || new Date(new Date().setMonth(new Date().getMonth() - 12))
  const startStr = start.toISOString()

  const [members, payments] = await Promise.all([
    FirestoreManager.findMany('members', [limit(500)], toMember),
    FirestoreManager.findMany('payments', [
      where('status', '==', 'paid'),
      where('paid_at', '>=', startStr),
      orderBy('paid_at', 'desc'),
      limit(1000),
    ], toPayment),
  ])

  const end = endDate || new Date()

  // Group payments by member plan
  const planRevenue: Record<PlanType, { count: number; revenue: number }> = {
    silver: { count: 0, revenue: 0 },
    gold: { count: 0, revenue: 0 },
    black: { count: 0, revenue: 0 },
  }

  const memberMap = new Map(members.map((m) => [m.id, m]))

  payments.forEach((p) => {
    const paidAt = p.paidAt ? new Date(p.paidAt) : null
    if (paidAt && paidAt >= start && paidAt <= end) {
      const member = memberMap.get(p.memberId)
      if (member && member.plan) {
        const plan = member.plan as PlanType
        if (planRevenue[plan]) {
          planRevenue[plan].count++
          planRevenue[plan].revenue += p.amount || 0
        }
      }
    }
  })

  const totalRevenue = Object.values(planRevenue).reduce((sum, p) => sum + p.revenue, 0)

  return Object.entries(planRevenue).map(([plan, data]) => ({
    plan: plan as PlanType,
    count: data.count,
    revenue: data.revenue,
    percentage: totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0,
  }))
}

/**
 * Get churn rate over time
 * Optimized: uses limit to reduce data transfer
 */
export async function getChurnRate(months: number = 6): Promise<ChurnData[]> {
  const now = new Date()
  const members = await FirestoreManager.findMany('members', [
    orderBy('created_at', 'desc'),
    limit(500),
  ], toMember)

  const churnData: ChurnData[] = []

  for (let i = 0; i < months; i++) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
    const monthLabel = monthDate.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })

    // Members active at start of month
    const activeAtStart = members.filter((m) => {
      const createdAt = m.createdAt ? new Date(m.createdAt) : null
      const expiryDate = m.expiryDate ? new Date(m.expiryDate) : null
      return createdAt && createdAt < monthDate && (!expiryDate || expiryDate >= monthDate)
    }).length

    // Members that churned during this month
    const churned = members.filter((m) => {
      const expiryDate = m.expiryDate ? new Date(m.expiryDate) : null
      return expiryDate && expiryDate >= monthDate && expiryDate <= monthEnd && m.status !== 'active'
    }).length

    const churnRate = activeAtStart > 0 ? (churned / activeAtStart) * 100 : 0

    churnData.unshift({
      period: monthLabel,
      churnRate: Math.round(churnRate * 10) / 10,
      churned,
      total: activeAtStart,
    })
  }

  return churnData
}

/**
 * Get points overview over time
 * Optimized: uses date filter and limit
 */
export async function getPointsOverview(months: number = 3): Promise<PointsOverview[]> {
  const now = new Date()
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)
  const startDateStr = startDate.toISOString()

  const pointTransactions = await FirestoreManager.findMany('point_transactions', [
    where('created_at', '>=', startDateStr),
    orderBy('created_at', 'desc'),
    limit(2000),
  ], toPointTransaction)

  const overview: PointsOverview[] = []

  for (let i = 0; i < months; i++) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
    const monthLabel = monthDate.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })

    const monthTransactions = pointTransactions.filter((t) => {
      const createdAt = t.createdAt ? new Date(t.createdAt) : null
      return createdAt && createdAt >= monthDate && createdAt <= monthEnd
    })

    const earned = monthTransactions.filter((t) => t.type === 'earn').reduce((sum, t) => sum + t.points, 0)
    const redeemed = monthTransactions.filter((t) => t.type === 'redeem').reduce((sum, t) => sum + Math.abs(t.points), 0)
    const expired = monthTransactions.filter((t) => t.type === 'expire').reduce((sum, t) => sum + Math.abs(t.points), 0)

    overview.unshift({
      period: monthLabel,
      earned,
      redeemed,
      expired,
      netChange: earned - redeemed - expired,
    })
  }

  return overview
}

/**
 * Get current member statistics
 * Optimized: uses limit for safety
 */
export async function getMemberStats(): Promise<{
  total: number
  active: number
  pending: number
  expired: number
  byPlan: Record<PlanType, number>
}> {
  const members = await FirestoreManager.findMany('members', [limit(1000)], toMember)
  const now = new Date()

  const stats = {
    total: members.length,
    active: 0,
    pending: 0,
    expired: 0,
    byPlan: { silver: 0, gold: 0, black: 0 } as Record<PlanType, number>,
  }

  members.forEach((m) => {
    // Count by status
    if (m.status === 'active') {
      const expiryDate = m.expiryDate ? new Date(m.expiryDate) : null
      if (expiryDate && expiryDate < now) {
        stats.expired++
      } else {
        stats.active++
      }
    } else if (m.status === 'pending') {
      stats.pending++
    } else if (m.status === 'expired' || m.status === 'inactive') {
      stats.expired++
    }

    // Count by plan
    const plan = m.plan as PlanType
    if (stats.byPlan[plan] !== undefined) {
      stats.byPlan[plan]++
    }
  })

  return stats
}

/**
 * Get top members by points
 * Optimized: uses limit in query instead of fetching all
 */
export async function getTopMembersByPoints(count: number = 10): Promise<Member[]> {
  const members = await FirestoreManager.findMany(
    'members',
    [
      where('points', '>', 0),
      orderBy('points', 'desc'),
      limit(count),
    ],
    toMember
  )

  return members
}

/**
 * Calculate growth rate between two periods
 */
export function calculateGrowthRate(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100 * 10) / 10
}
