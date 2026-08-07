import { api } from './api-client'
import type { PlanType } from '../types'

// ============================================
// TYPES (aligned with server/api report.service)
// ============================================

export interface MonthlyReportData {
  period: string
  month: string
  revenue: number
  paymentCount: number
  newMembers: number
  churnedMembers: number
  shopRevenue: number
  shopOrders: number
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

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Monthly report — continuous month series with real revenue, members and shop totals.
 */
export async function getMonthlyReport(months: number = 6): Promise<MonthlyReportData[]> {
  const result = await api.get(`/reports/monthly?months=${months}`)
  if (result.error || !result.data) return []

  const rows = Array.isArray(result.data) ? result.data : []
  return rows.map((row: Record<string, unknown>) => {
    const month = String(row.month ?? '')
    return {
      period: month,
      month,
      revenue: num(row.revenue),
      paymentCount: num(row.paymentCount ?? row.payment_count),
      newMembers: num(row.newMembers ?? row.new_members),
      churnedMembers: num(row.churnedMembers ?? row.churned_members),
      shopRevenue: num(row.shopRevenue ?? row.shop_revenue),
      shopOrders: num(row.shopOrders ?? row.shop_orders),
    }
  })
}

/**
 * Plan distribution (single club plan with real active count + paid revenue).
 */
export async function getRevenueByPlan(): Promise<PlanDistribution[]> {
  const result = await api.get('/reports/plan-distribution')
  if (result.error || !result.data) return []

  const rows = Array.isArray(result.data) ? result.data : []
  return rows.map((row: Record<string, unknown>) => ({
    plan: (row.plan as PlanType) || 'club',
    count: num(row.count),
    revenue: num(row.revenue),
    percentage: num(row.percentage),
  }))
}

/**
 * Churn rate over time — shape: period, churnRate, churned, total
 */
export async function getChurnRate(months: number = 6): Promise<ChurnData[]> {
  try {
    const result = await api.get<ChurnData[]>(`/reports/churn?months=${months}`)
    if (result.error || !result.data) return []
    const rows = Array.isArray(result.data) ? result.data : []
    return rows.map((row: Record<string, unknown>) => ({
      period: String(row.period ?? row.month ?? ''),
      churnRate: num(row.churnRate ?? row.churn_rate),
      churned: num(row.churned),
      total: num(row.total),
    }))
  } catch {
    return []
  }
}

/**
 * Current member statistics from realtime-stats
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
  const active = num(m.active)
  return {
    total: num(m.total),
    active,
    pending: num(m.pending),
    expired: num(m.expired) + num(m.inactive),
    byPlan: {
      club: active,
    },
  }
}

/**
 * Growth rate between two periods (%)
 */
export function calculateGrowthRate(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100 * 10) / 10
}
