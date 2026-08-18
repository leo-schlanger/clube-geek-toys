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
    // Raw row: the route mixes snake_case and camelCase and the `map` below is
    // what normalises it. Typing this as ChurnData would misstate what arrived.
    const result = await api.get<Record<string, unknown>[]>(`/reports/churn?months=${months}`)
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

// ============================================
// ACTION ITEMS (the day panel)
// ============================================

export type ActionItemKey =
  | 'pix_pending'
  | 'to_separate'
  | 'to_ship'
  | 'shipped_stale'
  | 'questions_unanswered'
  | 'reviews_pending'
  | 'wholesale_pending'
  | 'stock_out'
  | 'stock_low'
  | 'members_expiring'
  | 'members_pending'

export interface ActionItem {
  key: ActionItemKey
  count: number
  /** Age in days of the oldest row in the queue; null when the queue is empty. */
  oldestDays: number | null
}

export interface ActionItemsReport {
  items: ActionItem[]
  totalPending: number
}

/**
 * Every admin queue that currently needs a human, with the age of its oldest
 * entry. An empty report is the healthy state, so failures return zero items
 * rather than throwing — the dashboard around it must still render.
 */
export async function getActionItems(): Promise<ActionItemsReport> {
  const result = await api.get<{ items?: unknown; totalPending?: unknown }>('/reports/action-items')
  if (result.error || !result.data) return { items: [], totalPending: 0 }

  const rows = Array.isArray(result.data.items) ? result.data.items : []
  const items = rows.map((row: Record<string, unknown>) => ({
    key: row.key as ActionItemKey,
    count: num(row.count),
    oldestDays: row.oldestDays === null || row.oldestDays === undefined ? null : num(row.oldestDays),
  }))

  return {
    items,
    totalPending: num(result.data.totalPending),
  }
}

// ============================================
// CONSOLIDATED PERIOD REPORT (PDF source)
// ============================================

export type OverviewPeriod = 'day' | 'month' | 'year'

export interface OverviewReport {
  period: { type: OverviewPeriod; start: string; end: string }
  sales: {
    orders: number
    revenue: number
    averageTicket: number
    subtotal: number
    discount: number
    shipping: number
    storeCredit: number
    retailOrders: number
    retailRevenue: number
    wholesaleOrders: number
    wholesaleRevenue: number
    pixOrders: number
    cardOrders: number
    pendingOrders: number
    cancelledOrders: number
    refundedOrders: number
  }
  club: {
    revenue: number
    payments: number
    newMembers: number
    activeMembers: number
    expiredInPeriod: number
  }
  products: {
    unitsSold: number
    distinctProducts: number
    top: { name: string; quantity: number; revenue: number }[]
    activeSkus: number
    outOfStock: number
    lowStock: number
  }
  previous: { salesRevenue: number; clubRevenue: number; orders: number; newMembers: number }
}

/**
 * Everything about one period — shop, club, products and stock — in one call.
 *
 * Throws on failure rather than returning zeros: this feeds a PDF the manager
 * may file or forward, and a report full of legitimate-looking zeros is worse
 * than no report.
 */
export async function getOverviewReport(period: OverviewPeriod, date?: string): Promise<OverviewReport> {
  const params = new URLSearchParams({ period })
  if (date) params.set('date', date)

  const result = await api.get<OverviewReport>(`/reports/overview?${params.toString()}`)
  if (result.error || !result.data) {
    throw new Error(result.error || 'Não foi possível carregar o relatório')
  }
  return result.data
}
