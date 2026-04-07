import { api } from './api-client'
import type { PlanType, Member } from '../types'

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
// REPORT FUNCTIONS (via API)
// ============================================

/**
 * Get monthly report data
 */
export async function getMonthlyReport(months: number = 6): Promise<MonthlyReportData[]> {
  const result = await api.get(`/reports/monthly?months=${months}`)
  if (result.error || !result.data) return []

  return result.data.map((row: Record<string, unknown>) => ({
    period: row.month as string,
    month: row.month as string,
    revenue: row.revenue as number,
    newMembers: (row.newMembers as number) || 0,
    churnedMembers: (row.churnedMembers as number) || 0,
    pointsEarned: (row.pointsEarned as number) || 0,
    pointsRedeemed: (row.pointsRedeemed as number) || 0,
  }))
}

/**
 * Get revenue breakdown by plan
 */
export async function getRevenueByPlan(): Promise<PlanDistribution[]> {
  // Derived from realtime stats endpoint
  const result = await api.get('/reports/realtime-stats')
  if (result.error || !result.data) return []

  const members = result.data.members || {}
  const plans: PlanDistribution[] = [
    { plan: 'silver', count: members.silver || 0, revenue: 0, percentage: 0 },
    { plan: 'gold', count: members.gold || 0, revenue: 0, percentage: 0 },
    { plan: 'black', count: members.black || 0, revenue: 0, percentage: 0 },
  ]

  const total = plans.reduce((sum, p) => sum + p.count, 0)
  plans.forEach(p => {
    p.percentage = total > 0 ? (p.count / total) * 100 : 0
  })

  return plans
}

/**
 * Get churn rate over time
 */
export async function getChurnRate(_months: number = 6): Promise<ChurnData[]> {
  try {
    const result = await api.get<ChurnData[]>('/reports/churn')
    return result.data || []
  } catch {
    return []
  }
}

/**
 * Get points overview over time
 */
export async function getPointsOverview(_months: number = 3): Promise<PointsOverview[]> {
  try {
    const result = await api.get<PointsOverview[]>('/reports/points-overview')
    return result.data || []
  } catch {
    return []
  }
}

/**
 * Get current member statistics
 */
export async function getMemberStats(): Promise<{
  total: number
  active: number
  pending: number
  expired: number
  byPlan: Record<PlanType, number>
}> {
  const result = await api.get('/reports/realtime-stats')
  if (result.error || !result.data) {
    return { total: 0, active: 0, pending: 0, expired: 0, byPlan: { silver: 0, gold: 0, black: 0 } }
  }

  const m = result.data.members || {}
  return {
    total: m.total || 0,
    active: m.active || 0,
    pending: m.pending || 0,
    expired: m.expired || 0,
    byPlan: {
      silver: m.silver || 0,
      gold: m.gold || 0,
      black: m.black || 0,
    },
  }
}

/**
 * Get top members by points
 */
export async function getTopMembersByPoints(count: number = 10): Promise<Member[]> {
  const result = await api.get<{ members: Member[] }>(`/members?limit=${count}`)
  const members = result.data?.members || []
  return members.sort((a, b) => (b.points || 0) - (a.points || 0))
}

/**
 * Calculate growth rate between two periods
 */
export function calculateGrowthRate(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100 * 10) / 10
}
