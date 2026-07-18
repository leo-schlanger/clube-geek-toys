import { api } from './api-client'
import type { PlanType } from '../types'

// ============================================
// TYPES
// ============================================

export interface MonthlyReportData {
  period: string
  month: string
  revenue: number
  newMembers: number
  churnedMembers: number
}

export interface DailyReportData {
  date: string
  revenue: number
  payments: number
  members: {
    total: number
    active: number
    pending: number
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
  }))
}

/**
 * Get revenue breakdown by plan
 */
export async function getRevenueByPlan(): Promise<PlanDistribution[]> {
  // Derived from realtime stats endpoint
  const result = await api.get('/reports/realtime-stats')
  if (result.error || !result.data) return []

  const members = (result.data as { members?: { total?: number } }).members || {}
  const count = members.total || 0

  return [
    { plan: 'club', count, revenue: 0, percentage: count > 0 ? 100 : 0 },
  ]
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
    return { total: 0, active: 0, pending: 0, expired: 0, byPlan: { club: 0 } }
  }

  const m = (result.data as { members?: Record<string, number> }).members || {}
  return {
    total: m.total || 0,
    active: m.active || 0,
    pending: m.pending || 0,
    expired: m.expired || 0,
    byPlan: {
      club: m.total || 0,
    },
  }
}

/**
 * Calculate growth rate between two periods
 */
export function calculateGrowthRate(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100 * 10) / 10
}
