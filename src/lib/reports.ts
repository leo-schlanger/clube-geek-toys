import { api, unwrapApi } from './api-client'
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
  ticketRevenue: number
  ticketCount: number
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
// The report getters throw on a failed call. Returning [] made the charts say
// "nenhum pagamento confirmado" — an outage read as a month without sales.
export async function getMonthlyReport(months: number = 6): Promise<MonthlyReportData[]> {
  const data = unwrapApi(await api.get(`/reports/monthly?months=${months}`), 'Erro ao carregar o relatório mensal')
  const rows = Array.isArray(data) ? data : []
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
      ticketRevenue: num(row.ticketRevenue ?? row.ticket_revenue),
      ticketCount: num(row.ticketCount ?? row.ticket_count),
    }
  })
}

/**
 * Plan distribution (single club plan with real active count + paid revenue).
 */
export async function getRevenueByPlan(): Promise<PlanDistribution[]> {
  const data = unwrapApi(await api.get('/reports/plan-distribution'), 'Erro ao carregar o plano do clube')
  const rows = Array.isArray(data) ? data : []
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
  // Raw row: the route mixes snake_case and camelCase and the `map` below is
  // what normalises it. Typing this as ChurnData would misstate what arrived.
  const data = unwrapApi(
    await api.get<Record<string, unknown>[]>(`/reports/churn?months=${months}`),
    'Erro ao carregar o churn'
  )
  const rows = Array.isArray(data) ? data : []
  return rows.map((row: Record<string, unknown>) => ({
    period: String(row.period ?? row.month ?? ''),
    churnRate: num(row.churnRate ?? row.churn_rate),
    churned: num(row.churned),
    total: num(row.total),
  }))
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
  | 'to_release_pickup'
  | 'shipped_stale'
  | 'questions_unanswered'
  | 'event_tickets_pending'
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

export type OverviewPeriod = 'day' | 'month' | 'year' | 'range'

/** Inclusive calendar dates (YYYY-MM-DD) for the custom range. */
export interface OverviewRange {
  start: string
  end: string
}

export type PaymentMethodKey = 'pix' | 'credit_card' | 'debit_card' | 'boleto' | 'cash' | 'other'

export interface LedgerEntry {
  kind: 'shop' | 'club' | 'ticket'
  id: string
  reference: string
  at: string
  customer: string
  description: string
  method: PaymentMethodKey
  channel: string | null
  installments: number | null
  /** `refunded_later`: sold here, refunded after the period. `refund`: money back for an earlier sale. */
  status: string
  subtotal: number
  discount: number
  shipping: number
  total: number
  /** True when the entry is part of the period's revenue. */
  counted: boolean
}

export interface OverviewReport {
  period: { type: OverviewPeriod; start: string; end: string; previousStart?: string; days?: number }
  sales: {
    orders: number
    /** The period's sales minus refunds made in it of earlier sales. */
    revenue: number
    grossRevenue: number
    priorRefunds: number
    priorRefundsCount: number
    averageTicket: number
    /** Products only (subtotal minus discount), per order. */
    averageProductTicket: number
    subtotal: number
    discount: number
    shipping: number
    shippedOrders: number
    /** What Melhor Envio charged for the labels, and the shipping charged on those same orders. */
    labelCost: number
    shippingWithLabel: number
    labelsWithCost: number
    storeCredit: number
    retailOrders: number
    retailRevenue: number
    wholesaleOrders: number
    wholesaleRevenue: number
    pixOrders: number
    cardOrders: number
    pixRevenue: number
    cardRevenue: number
    pendingOrders: number
    pendingRevenue: number
    /** Attempts: one customer retrying a card counts many times. */
    cancelledOrders: number
    cancelledRevenue: number
    cancelledCustomers: number
    /** Largest cancelled cart of each customer, summed. */
    cancelledCartsValue: number
    /** Refunds made in the period, whatever period the sale was in. */
    refundedOrders: number
    refundedRevenue: number
  }
  club: {
    revenue: number
    grossRevenue: number
    priorRefunds: number
    priorRefundsCount: number
    payments: number
    newMembers: number
    activeMembers: number
    expiredInPeriod: number
    refunded: number
    refundedPayments: number
    /** Sign-up forms filled in the period, and how many of them paid. */
    signups: number
    signupsPaid: number
    conversionPct: number
  }
  /** Result: only lines with a known cost are counted. */
  margin: {
    cogs: number
    grossProfit: number
    marginPct: number
    revenueWithCost: number
    revenueWithoutCost: number
    costCoveragePct: number
    unitsWithoutCost: number
    inventoryValue: number
    productsWithoutCost: number
  }
  products: {
    unitsSold: number
    distinctProducts: number
    top: { name: string; quantity: number; revenue: number }[]
    ranking: { name: string; quantity: number; revenue: number; cost: number | null }[]
    activeSkus: number
    outOfStock: number
    lowStock: number
  }
  tickets: { revenue: number; reservations: number; tickets: number }
  ticketsByEvent: {
    eventId: string
    title: string
    startsAt: string | null
    reservations: number
    tickets: number
    checkedIn: number
    revenue: number
  }[]
  /** As of now: active products with stock and no sale for `days` days. */
  stale: {
    days: number
    count: number
    units: number
    shelfValue: number
    items: { name: string; stock: number; price: number; lastSoldAt: string | null; listedAt: string | null }[]
  }
  series: {
    bucket: 'day' | 'month'
    points: { date: string; shop: number; club: number; tickets: number; total: number; orders: number }[]
  }
  byMethod: { method: PaymentMethodKey; count: number; revenue: number }[]
  byCategory: { name: string; quantity: number; revenue: number }[]
  ledger: { entries: LedgerEntry[]; truncated: boolean }
  previous: { salesRevenue: number; clubRevenue: number; ticketRevenue: number; orders: number; newMembers: number }
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethodKey, string> = {
  pix: 'PIX',
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  boleto: 'Boleto',
  cash: 'Dinheiro',
  other: 'Outro',
}

export const LEDGER_KIND_LABEL: Record<LedgerEntry['kind'], string> = {
  shop: 'Loja',
  club: 'Clube',
  ticket: 'Ingresso',
}

/** Order, club payment and ticket states, in the words the panel uses. */
export const LEDGER_STATUS_LABEL: Record<string, string> = {
  pending: 'Aguardando pagamento',
  paid: 'Pago',
  processing: 'Em separação',
  shipped: 'Enviado',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
  refunded: 'Estornado',
  refunded_later: 'Estornado depois',
  refund: 'Estorno',
  confirmed: 'Confirmado',
  failed: 'Falhou',
}

/**
 * Everything about one period — shop, club, tickets, products, stock and the
 * list of sales — in one call. The panel, the PDF and the spreadsheet all read
 * it, so the three never disagree about a number.
 *
 * Throws on failure rather than returning zeros: a report full of
 * legitimate-looking zeros is worse than no report.
 */
export async function getOverviewReport(
  period: OverviewPeriod,
  date?: string,
  range?: OverviewRange
): Promise<OverviewReport> {
  const params = new URLSearchParams({ period })
  if (period === 'range' && range) {
    params.set('start', range.start)
    params.set('end', range.end)
  } else if (date) {
    params.set('date', date)
  }

  const result = await api.get<OverviewReport>(`/reports/overview?${params.toString()}`)
  if (result.error || !result.data) {
    throw new Error(result.error || 'Não foi possível carregar o relatório')
  }
  return result.data
}
