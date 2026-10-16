import { query } from '../config/database.js';
import { moduleLogger } from '../config/logger.js';

const log = moduleLogger('report');

/**
 * Reports service — real aggregates from members, payments and shop orders.
 *
 * Contract (frontend expects):
 *  monthly: { month, revenue, paymentCount, newMembers, churnedMembers, shopRevenue? }
 *  churn:   { period, churnRate, churned, total }
 *  plan:    { plan, count, revenue, percentage }[]
 *  realtime-stats: members.* + payments.month_revenue + payments.today_revenue
 */

/** Order states that represent money actually earned. */
const EARNED_ORDER_STATUSES = `('paid','processing','shipped','delivered')`;
/**
 * What a line actually brought in. `line_total` is the shelf price times the
 * quantity; the order's discount (member, promotion, coupon) lives only on the
 * order, so it is spread over the lines in proportion to their value.
 */
const NET_LINE = `(oi.line_total * CASE WHEN o.subtotal > 0 THEN (o.subtotal - o.discount) / o.subtotal ELSE 1 END)`;

function clampMonths(months: number): number {
  const n = Number.isFinite(months) ? Math.trunc(months) : 6;
  return Math.max(1, Math.min(n, 24));
}

/**
 * Days and months are the shop's, in Rio — not UTC. Database and API both run
 * in UTC, so cutting there put a sale made after 21h on the next day, and one
 * on the evening of the 31st in the next month.
 */
export const BUSINESS_TZ = 'America/Sao_Paulo';
/** A timestamptz seen on the shop's wall clock (a `timestamp` in Rio). */
const local = (ts: string) => `(${ts} AT TIME ZONE '${BUSINESS_TZ}')`;
const NOW_LOCAL = local('NOW()');
const TODAY_LOCAL = `${NOW_LOCAL}::date`;
/** Back from Rio wall-clock to a real instant, for comparisons against timestamptz columns. */
const toInstant = (localTs: string) => `((${localTs}) AT TIME ZONE '${BUSINESS_TZ}')`;
/** Start of the first month in a window of $N months that ends with the current one. */
const windowStart = (paramIndex: number) =>
  toInstant(`date_trunc('month', ${NOW_LOCAL}) - (($${paramIndex}::int - 1) * INTERVAL '1 month')`);

/** Inclusive month series in Rio time, oldest first (YYYY-MM, start and end instants). */
function monthSeriesSql(paramIndex: number): string {
  return `
    SELECT
      TO_CHAR(d, 'YYYY-MM') AS month,
      ${toInstant('d')} AS month_start,
      ${toInstant(`d + INTERVAL '1 month'`)} AS month_end
    FROM generate_series(
      date_trunc('month', ${NOW_LOCAL}) - (($${paramIndex}::int - 1) * INTERVAL '1 month'),
      date_trunc('month', ${NOW_LOCAL}),
      INTERVAL '1 month'
    ) AS d
  `;
}

/**
 * Event tickets are the third kind of revenue, next to the shop and the club.
 * Paid through Pagar.me they carry `paid_at`; the ones confirmed by hand before
 * that only carry `confirmed_at`, which is when the money was acknowledged.
 */
const TICKET_PAID_AT = 'COALESCE(paid_at, confirmed_at)';
const TICKET_EARNED = `status = 'confirmed' AND total_cents > 0 AND ${TICKET_PAID_AT} IS NOT NULL`;

/**
 * When a member left the club. `updated_at` moves on any edit, so a member who
 * expired in July and had a phone number fixed in October left "in October".
 * An expiry has its date; only a manual deactivation falls back to the edit.
 */
const MEMBER_EXIT_AT = `CASE WHEN status = 'expired' AND expiry_date IS NOT NULL
    THEN ${toInstant('expiry_date::timestamp')} ELSE updated_at END`;

export async function getDailyReport() {
  const [day, revenue, members, shop, tickets] = await Promise.all([
    query(`SELECT ${TODAY_LOCAL}::text AS today`),
    query(
      `SELECT COALESCE(SUM(amount), 0)::float AS total, COUNT(*)::int AS count
       FROM payments WHERE status = 'paid' AND paid_at IS NOT NULL AND ${local('paid_at')}::date = ${TODAY_LOCAL}`
    ),
    query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'active')::int AS active,
         COUNT(*) FILTER (WHERE ${local('activated_at')}::date = ${TODAY_LOCAL})::int AS new_today
       FROM members`
    ),
    query(
      `SELECT COALESCE(SUM(total), 0)::float AS total, COUNT(*)::int AS count
       FROM orders
       WHERE status IN ${EARNED_ORDER_STATUSES}
         AND ${local('COALESCE(paid_at, created_at)')}::date = ${TODAY_LOCAL}`
    ),
    query(
      `SELECT COALESCE(SUM(total_cents), 0)::float / 100 AS total, COUNT(*)::int AS count
       FROM event_reservations WHERE ${TICKET_EARNED} AND ${local(TICKET_PAID_AT)}::date = ${TODAY_LOCAL}`
    ),
  ]);

  return {
    date: day.rows[0].today as string,
    revenue: { total: revenue.rows[0].total, paymentCount: revenue.rows[0].count },
    shop: { total: shop.rows[0].total, orderCount: shop.rows[0].count },
    tickets: { total: Number(tickets.rows[0].total) || 0, count: tickets.rows[0].count },
    members: members.rows[0],
  };
}

/**
 * Monthly report with a continuous month axis (zeros when empty), in Rio time.
 * revenue = paid club payments; shopRevenue = earned shop orders; ticketRevenue =
 * confirmed paid tickets; newMembers = sign-ups; churned = members who left that month.
 */
export async function getMonthlyReport(months: number) {
  const window = clampMonths(months);

  const result = await query(
    `
    WITH months AS (${monthSeriesSql(1)}),
    revenue AS (
      SELECT TO_CHAR(${local('paid_at')}, 'YYYY-MM') AS month,
             COALESCE(SUM(amount), 0)::float AS revenue,
             COUNT(*)::int AS payment_count
      FROM payments
      WHERE status = 'paid' AND paid_at IS NOT NULL AND paid_at >= ${windowStart(1)}
      GROUP BY 1
    ),
    -- A member is new when activated, not when the form was filled: a signup
    -- whose payment never came counted as a new member (09/10/2026).
    new_members AS (
      SELECT TO_CHAR(${local('activated_at')}, 'YYYY-MM') AS month, COUNT(*)::int AS new_members
      FROM members
      WHERE activated_at >= ${windowStart(1)}
      GROUP BY 1
    ),
    churned AS (
      SELECT TO_CHAR(${local('exit_at')}, 'YYYY-MM') AS month, COUNT(*)::int AS churned_members
      FROM (SELECT ${MEMBER_EXIT_AT} AS exit_at FROM members WHERE status IN ('expired', 'inactive')) e
      WHERE exit_at >= ${windowStart(1)}
      GROUP BY 1
    ),
    shop AS (
      SELECT TO_CHAR(${local('COALESCE(paid_at, created_at)')}, 'YYYY-MM') AS month,
             COALESCE(SUM(total), 0)::float AS shop_revenue,
             COUNT(*)::int AS shop_orders
      FROM orders
      WHERE status IN ${EARNED_ORDER_STATUSES}
        AND COALESCE(paid_at, created_at) >= ${windowStart(1)}
      GROUP BY 1
    ),
    tickets AS (
      SELECT TO_CHAR(${local(TICKET_PAID_AT)}, 'YYYY-MM') AS month,
             COALESCE(SUM(total_cents), 0)::float / 100 AS ticket_revenue,
             COUNT(*)::int AS ticket_count
      FROM event_reservations
      WHERE ${TICKET_EARNED} AND ${TICKET_PAID_AT} >= ${windowStart(1)}
      GROUP BY 1
    )
    SELECT
      m.month,
      COALESCE(r.revenue, 0)::float AS revenue,
      COALESCE(r.payment_count, 0)::int AS payment_count,
      COALESCE(n.new_members, 0)::int AS new_members,
      COALESCE(c.churned_members, 0)::int AS churned_members,
      COALESCE(s.shop_revenue, 0)::float AS shop_revenue,
      COALESCE(s.shop_orders, 0)::int AS shop_orders,
      COALESCE(t.ticket_revenue, 0)::float AS ticket_revenue,
      COALESCE(t.ticket_count, 0)::int AS ticket_count
    FROM months m
    LEFT JOIN revenue r ON r.month = m.month
    LEFT JOIN new_members n ON n.month = m.month
    LEFT JOIN churned c ON c.month = m.month
    LEFT JOIN shop s ON s.month = m.month
    LEFT JOIN tickets t ON t.month = m.month
    ORDER BY m.month ASC
    `,
    [window]
  );

  return result.rows.map((row) => ({
    month: row.month as string,
    revenue: Number(row.revenue) || 0,
    paymentCount: Number(row.payment_count) || 0,
    newMembers: Number(row.new_members) || 0,
    churnedMembers: Number(row.churned_members) || 0,
    shopRevenue: Number(row.shop_revenue) || 0,
    shopOrders: Number(row.shop_orders) || 0,
    ticketRevenue: Number(row.ticket_revenue) || 0,
    ticketCount: Number(row.ticket_count) || 0,
  }));
}

/**
 * Churn per month, in Rio time: churned / members in the club at the month start.
 * In the club = joined before the month and had not left yet (pending never-paid excluded).
 */
export async function getChurnReport(months: number = 6) {
  const window = clampMonths(months);

  const result = await query(
    `
    WITH months AS (${monthSeriesSql(1)}),
    ever AS (
      SELECT id, COALESCE(activated_at, created_at) AS joined_at, status, ${MEMBER_EXIT_AT} AS exit_at
      FROM members WHERE status IN ('active', 'expired', 'inactive')
    ),
    churned AS (
      SELECT TO_CHAR(${local('exit_at')}, 'YYYY-MM') AS month, COUNT(*)::int AS churned
      FROM ever
      WHERE status IN ('expired', 'inactive') AND exit_at >= ${windowStart(1)}
      GROUP BY 1
    ),
    base AS (
      SELECT m.month, COUNT(e.id)::int AS total
      FROM months m
      LEFT JOIN ever e
        ON e.joined_at < m.month_start
        AND (e.status = 'active' OR e.exit_at >= m.month_start)
      GROUP BY m.month
    )
    SELECT
      m.month AS period,
      COALESCE(c.churned, 0)::int AS churned,
      COALESCE(b.total, 0)::int AS total,
      CASE
        WHEN COALESCE(b.total, 0) = 0 THEN 0
        ELSE ROUND((COALESCE(c.churned, 0)::numeric / b.total) * 100, 1)::float
      END AS churn_rate
    FROM months m
    LEFT JOIN churned c ON c.month = m.month
    LEFT JOIN base b ON b.month = m.month
    ORDER BY m.month ASC
    `,
    [window]
  );

  return result.rows.map((row) => ({
    period: row.period as string,
    churned: Number(row.churned) || 0,
    total: Number(row.total) || 0,
    churnRate: Number(row.churn_rate) || 0,
  }));
}

export async function getTodayRevenue() {
  const [day, club, shop, tickets] = await Promise.all([
    query(`SELECT ${TODAY_LOCAL}::text AS today`),
    query(
      `SELECT COALESCE(SUM(amount), 0)::float AS total, COUNT(*)::int AS count
       FROM payments
       WHERE status = 'paid' AND paid_at IS NOT NULL AND ${local('paid_at')}::date = ${TODAY_LOCAL}`
    ),
    query(
      `SELECT COALESCE(SUM(total), 0)::float AS total, COUNT(*)::int AS count
       FROM orders
       WHERE status IN ${EARNED_ORDER_STATUSES}
         AND ${local('COALESCE(paid_at, created_at)')}::date = ${TODAY_LOCAL}`
    ),
    query(
      `SELECT COALESCE(SUM(total_cents), 0)::float / 100 AS total, COUNT(*)::int AS count
       FROM event_reservations WHERE ${TICKET_EARNED} AND ${local(TICKET_PAID_AT)}::date = ${TODAY_LOCAL}`
    ),
  ]);

  return {
    total: club.rows[0].total,
    paymentCount: club.rows[0].count,
    shopTotal: shop.rows[0].total,
    shopOrderCount: shop.rows[0].count,
    ticketTotal: Number(tickets.rows[0].total) || 0,
    ticketCount: tickets.rows[0].count,
    date: day.rows[0].today as string,
  };
}

/**
 * Plan distribution for the single-plan model (club).
 * count = active members; revenue = all-time paid club payments.
 */
export async function getPlanDistribution() {
  const result = await query(
    `
    SELECT
      COUNT(*) FILTER (WHERE status = 'active')::int AS active_count,
      COUNT(*)::int AS total_count,
      (
        SELECT COALESCE(SUM(amount), 0)::float
        FROM payments
        WHERE status = 'paid'
      ) AS total_revenue
    FROM members
    `
  );

  const row = result.rows[0] || { active_count: 0, total_count: 0, total_revenue: 0 };
  const count = Number(row.active_count) || 0;
  const revenue = Number(row.total_revenue) || 0;

  return [
    {
      plan: 'club' as const,
      count,
      revenue,
      percentage: count > 0 || Number(row.total_count) > 0 ? 100 : 0,
    },
  ];
}

/** Month, Sunday-based week and day boundaries in Rio, as instants. */
const MONTH_START = toInstant(`date_trunc('month', ${NOW_LOCAL})`);
const WEEK_START = toInstant(`(${TODAY_LOCAL} - EXTRACT(DOW FROM ${NOW_LOCAL})::int)::timestamp`);

export async function getRealtimeStats() {
  const [members, payments, shop, tickets, revenue] = await Promise.all([
    query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE status = 'expired')::int AS expired,
        COUNT(*) FILTER (WHERE status = 'inactive')::int AS inactive,
        COUNT(*) FILTER (WHERE ${local('activated_at')}::date = ${TODAY_LOCAL})::int AS new_today,
        COUNT(*) FILTER (WHERE activated_at >= ${WEEK_START})::int AS new_this_week
      FROM members`
    ),
    query(
      `
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE paid_at >= ${MONTH_START}), 0)::float AS month_revenue,
        COUNT(*) FILTER (WHERE paid_at >= ${MONTH_START})::int AS month_payments,
        COALESCE(SUM(amount) FILTER (WHERE ${local('paid_at')}::date = ${TODAY_LOCAL}), 0)::float AS today_revenue,
        COUNT(*) FILTER (WHERE ${local('paid_at')}::date = ${TODAY_LOCAL})::int AS today_payments
      FROM payments
      WHERE status = 'paid' AND paid_at IS NOT NULL`
    ),
    query(
      `
      SELECT
        COALESCE(SUM(total) FILTER (WHERE COALESCE(paid_at, created_at) >= ${MONTH_START}), 0)::float AS month_shop_revenue,
        COUNT(*) FILTER (WHERE COALESCE(paid_at, created_at) >= ${MONTH_START})::int AS month_shop_orders,
        COALESCE(SUM(total) FILTER (
          WHERE ${local('COALESCE(paid_at, created_at)')}::date = ${TODAY_LOCAL}
        ), 0)::float AS today_shop_revenue
      FROM orders
      WHERE status IN ${EARNED_ORDER_STATUSES}`
    ),
    query(
      `
      SELECT
        COALESCE(SUM(total_cents) FILTER (WHERE ${TICKET_PAID_AT} >= ${MONTH_START}), 0)::float / 100 AS month_ticket_revenue,
        COUNT(*) FILTER (WHERE ${TICKET_PAID_AT} >= ${MONTH_START})::int AS month_tickets,
        COALESCE(SUM(total_cents) FILTER (
          WHERE ${local(TICKET_PAID_AT)}::date = ${TODAY_LOCAL}
        ), 0)::float / 100 AS today_ticket_revenue
      FROM event_reservations
      WHERE ${TICKET_EARNED}`
    ),
    // Everything that came in, from the three sources: the dashboard's headline.
    query(
      `
      WITH earned AS (
        SELECT COALESCE(paid_at, created_at) AS ts, total AS value FROM orders WHERE status IN ${EARNED_ORDER_STATUSES}
        UNION ALL
        SELECT paid_at, amount FROM payments WHERE status = 'paid' AND paid_at IS NOT NULL
        UNION ALL
        SELECT ${TICKET_PAID_AT}, total_cents::numeric / 100 FROM event_reservations WHERE ${TICKET_EARNED}
      )
      SELECT
        COALESCE(SUM(value) FILTER (WHERE ts >= ${MONTH_START}), 0)::float AS month_total,
        COALESCE(SUM(value) FILTER (WHERE ${local('ts')}::date = ${TODAY_LOCAL}), 0)::float AS today_total,
        COALESCE(SUM(value) FILTER (WHERE ${local('ts')}::date = ${TODAY_LOCAL} - 1), 0)::float AS yesterday_total
      FROM earned`
    ),
  ]);

  return {
    members: members.rows[0],
    payments: payments.rows[0],
    shop: shop.rows[0],
    tickets: tickets.rows[0],
    revenue: revenue.rows[0],
    timestamp: new Date().toISOString(),
  };
}

/** How long a shipped order may sit without a delivery confirmation. */
const SHIPPED_STALE_DAYS = 10;
/** Window used to warn about memberships about to lapse. */
const EXPIRING_SOON_DAYS = 7;

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
  | 'members_pending';

export interface ActionItem {
  key: ActionItemKey;
  count: number;
  /** Age in days of the oldest row in the queue; null when the queue is empty. */
  oldestDays: number | null;
}

export interface ActionItemsReport {
  items: ActionItem[];
  totalPending: number;
  timestamp: string;
}

/**
 * One `count` + `oldestDays` pair for a queue.
 *
 * Each queue is its own query with its own catch: a table missing on an older
 * schema (or an `ensureSchema` step that failed) degrades that single card to
 * zero instead of blanking the whole panel.
 */
async function queueStat(key: ActionItemKey, sql: string, params: unknown[] = []): Promise<ActionItem> {
  try {
    const result = await query(sql, params);
    const row = result.rows[0] || {};
    const count = Number(row.count) || 0;
    const oldest = row.oldest_days === null || row.oldest_days === undefined ? null : Number(row.oldest_days);
    return { key, count, oldestDays: count > 0 && Number.isFinite(oldest as number) ? (oldest as number) : null };
  } catch (err) {
    log.error({ err }, `action item "${key}" failed`);
    return { key, count: 0, oldestDays: null };
  }
}

/** `count` + age of the oldest row, for a queue keyed off a timestamp column. */
function queueSql(table: string, where: string, tsColumn = 'created_at'): string {
  return `SELECT COUNT(*)::int AS count,
                 EXTRACT(DAY FROM NOW() - MIN(${tsColumn}))::int AS oldest_days
          FROM ${table} WHERE ${where}`;
}

/**
 * Everything waiting on a human, in one call.
 *
 * The dashboard already answered "how much did we make"; nothing answered "what
 * is waiting on me". Each entry maps to an admin tab that can clear it, so the
 * panel is a worklist rather than another metric board. Counts mirror the
 * predicates each tab filters by, so a card and its tab never disagree.
 */
export async function getActionItems(): Promise<ActionItemsReport> {
  // Same shape the stock tab lists by: variants replace their parent product,
  // and seed/checkup rows stay out of both.
  const stockBase = `
    SELECT p.stock, p.low_stock_threshold, p.active, p.name AS product_name
    FROM products p WHERE p.has_variants = FALSE
    UNION ALL
    SELECT v.stock, p.low_stock_threshold, (p.active AND v.active), p.name
    FROM product_variants v JOIN products p ON p.id = v.product_id
  `;
  const stockWhere = `s.active = TRUE AND s.product_name NOT ILIKE 'checkup%'`;
  // Stock has no queue age — a SKU is not "waiting" since a date.
  const stockSql = (extra: string) =>
    `SELECT COUNT(*)::int AS count, NULL::int AS oldest_days
     FROM (${stockBase}) s WHERE ${stockWhere} AND ${extra}`;

  const items = await Promise.all([
    // Money that may already be in the account: no PIX webhook exists, so these
    // sit until someone compares the TX ID against the bank statement.
    queueStat('pix_pending', queueSql('orders', `status = 'pending' AND payment_method = 'pix'`)),
    queueStat('to_separate', queueSql('orders', `status = 'paid'`, 'COALESCE(paid_at, created_at)')),
    // Aged by `status_changed_at` (migration 025), not `updated_at`: any write
    // to the row bumps updated_at — saving a tracking code, adopting a guest
    // order — and a queue that resets because someone touched the order is a
    // queue that hides exactly the order that has been stuck the longest.
    // Pickup never goes to the Correios, so it gets its own queue: counted as
    // "a postar", it showed up as an order the shop could not find in the list.
    queueStat(
      'to_ship',
      queueSql('orders', `status = 'processing' AND delivery_method <> 'pickup'`, 'COALESCE(status_changed_at, updated_at)')
    ),
    queueStat(
      'to_release_pickup',
      queueSql('orders', `status = 'processing' AND delivery_method = 'pickup'`, 'COALESCE(status_changed_at, updated_at)')
    ),
    queueStat(
      'shipped_stale',
      queueSql(
        'orders',
        `status = 'shipped' AND COALESCE(status_changed_at, updated_at) < NOW() - INTERVAL '${SHIPPED_STALE_DAYS} days'`,
        'COALESCE(status_changed_at, updated_at)'
      )
    ),
    queueStat('questions_unanswered', queueSql('product_questions', `answered_at IS NULL AND status = 'published'`)),
    // A pending reservation is a PIX the buyer has not paid yet. Pagar.me
    // confirms it; the queue is there so a code that sits for hours is visible.
    queueStat('event_tickets_pending', queueSql('event_reservations', `status = 'pending'`)),
    queueStat('reviews_pending', queueSql('product_reviews', `status = 'pending'`)),
    queueStat('wholesale_pending', queueSql('wholesale_accounts', `status = 'pending'`)),
    queueStat('stock_out', stockSql('s.stock <= 0')),
    queueStat('stock_low', stockSql('s.stock > 0 AND s.stock <= s.low_stock_threshold')),
    // Age here is days until expiry, not days waiting — negatives are excluded
    // by the range itself.
    queueStat(
      'members_expiring',
      `SELECT COUNT(*)::int AS count,
              EXTRACT(DAY FROM MIN(expiry_date)::timestamptz - NOW())::int AS oldest_days
       FROM members
       WHERE status = 'active'
         AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '${EXPIRING_SOON_DAYS} days'`
    ),
    queueStat('members_pending', queueSql('members', `status = 'pending'`)),
  ]);

  return {
    items,
    totalPending: items.reduce((sum, item) => sum + item.count, 0),
    timestamp: new Date().toISOString(),
  };
}

/** Periods the consolidated report can be cut by. `range` is two dates the admin picks. */
export type OverviewPeriod = 'day' | 'month' | 'year' | 'range';

const OVERVIEW_PERIODS: OverviewPeriod[] = ['day', 'month', 'year', 'range'];

export function isOverviewPeriod(value: unknown): value is OverviewPeriod {
  return OVERVIEW_PERIODS.includes(value as OverviewPeriod);
}

/** Inclusive calendar dates (YYYY-MM-DD) on the Rio calendar. */
export interface OverviewRange {
  start: string;
  end: string;
}

/** Longest custom window: three years keeps the ledger and the daily series sane. */
export const MAX_RANGE_DAYS = 1100;
/** Above this many days the series is grouped by month instead of by day. */
const DAILY_SERIES_MAX_DAYS = 62;
/** The ledger is a working list, not an export of the whole history. */
export const LEDGER_LIMIT = 2000;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  // Rejects 2026-02-31, which Date would roll into March.
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

/**
 * Validate a custom range. Returns the range or a message the admin can act on;
 * a silently "fixed" range would report a period nobody asked for.
 */
export function parseRange(start: unknown, end: unknown): OverviewRange | { error: string } {
  const from = parseIsoDate(start);
  const to = parseIsoDate(end);
  if (!from || !to) return { error: 'Informe a data inicial e a final (AAAA-MM-DD).' };
  if (from > to) return { error: 'A data inicial é depois da final.' };
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  if (days > MAX_RANGE_DAYS) return { error: `O intervalo pode ter no máximo ${MAX_RANGE_DAYS} dias.` };
  return { start: start as string, end: end as string };
}

export type PaymentMethodKey = 'pix' | 'credit_card' | 'debit_card' | 'boleto' | 'cash' | 'other';

export interface LedgerEntry {
  kind: 'shop' | 'club' | 'ticket';
  id: string;
  reference: string;
  at: string;
  customer: string;
  description: string;
  method: PaymentMethodKey;
  channel: string | null;
  installments: number | null;
  status: string;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  /** True when the entry is part of the period's revenue. */
  counted: boolean;
}

export interface OverviewReport {
  period: { type: OverviewPeriod; start: string; end: string; previousStart: string; days: number };
  sales: {
    orders: number;
    revenue: number;
    averageTicket: number;
    subtotal: number;
    discount: number;
    shipping: number;
    storeCredit: number;
    retailOrders: number;
    retailRevenue: number;
    wholesaleOrders: number;
    wholesaleRevenue: number;
    pixOrders: number;
    cardOrders: number;
    pixRevenue: number;
    cardRevenue: number;
    pendingOrders: number;
    pendingRevenue: number;
    cancelledOrders: number;
    cancelledRevenue: number;
    refundedOrders: number;
    refundedRevenue: number;
  };
  club: {
    revenue: number;
    payments: number;
    newMembers: number;
    activeMembers: number;
    expiredInPeriod: number;
    refunded: number;
    refundedPayments: number;
  };
  tickets: { revenue: number; reservations: number; tickets: number };
  /**
   * Result, not revenue. Only lines carrying `unit_cost` are counted; the rest
   * become `revenueWithoutCost`, so the figure never passes itself off as whole.
   */
  margin: {
    cogs: number;
    grossProfit: number;
    marginPct: number;
    revenueWithCost: number;
    revenueWithoutCost: number;
    costCoveragePct: number;
    unitsWithoutCost: number;
    inventoryValue: number;
    productsWithoutCost: number;
  };
  products: {
    unitsSold: number;
    distinctProducts: number;
    top: { name: string; quantity: number; revenue: number }[];
    /** Every product sold in the period, with its cost when known (spreadsheet source). */
    ranking: { name: string; quantity: number; revenue: number; cost: number | null }[];
    activeSkus: number;
    outOfStock: number;
    lowStock: number;
  };
  /** Revenue of the three sources, bucketed by day (short windows) or month. */
  series: {
    bucket: 'day' | 'month';
    points: { date: string; shop: number; club: number; tickets: number; total: number; orders: number }[];
  };
  /** Money in by payment method, across shop, club and tickets. */
  byMethod: { method: PaymentMethodKey; count: number; revenue: number }[];
  /** Shop revenue by the product's main category, net of the order discount. */
  byCategory: { name: string; quantity: number; revenue: number }[];
  ledger: { entries: LedgerEntry[]; truncated: boolean };
  previous: { salesRevenue: number; clubRevenue: number; ticketRevenue: number; orders: number; newMembers: number };
}

const METHODS: PaymentMethodKey[] = ['pix', 'credit_card', 'debit_card', 'boleto', 'cash'];
const toMethod = (value: unknown): PaymentMethodKey =>
  METHODS.includes(value as PaymentMethodKey) ? (value as PaymentMethodKey) : 'other';

const iso = (value: unknown) => new Date(value as string).toISOString();

/**
 * Where the period starts and ends, and where the comparison window starts.
 *
 * Calendar periods are cut by the database on the Rio calendar; the previous
 * window is the same period shifted back once, so February is compared with
 * January, not with a rolling 28 days. A custom range is compared with the same
 * number of days right before it.
 */
async function resolveBounds(period: OverviewPeriod, reference?: string, range?: OverviewRange) {
  if (period === 'range') {
    if (!range) throw new Error('range period needs start and end');
    const bounds = await query(
      `SELECT ${toInstant('$1::date::timestamp')} AS start_at,
              ${toInstant(`($2::date + 1)::timestamp`)} AS end_at,
              ${toInstant(`($1::date - ($2::date - $1::date + 1))::timestamp`)} AS prev_start_at,
              ($2::date - $1::date + 1)::int AS days`,
      [range.start, range.end]
    );
    return bounds.rows[0];
  }

  // An impossible date (2026-02-31) reached Postgres and came back as a 500.
  const ref = parseIsoDate(reference) ? (reference as string) : null;
  const day = `COALESCE($2::date, ${TODAY_LOCAL})::timestamp`;
  const bounds = await query(
    `SELECT ${toInstant(`date_trunc($1, ${day})`)} AS start_at,
            ${toInstant(`date_trunc($1, ${day}) + ('1 ' || $1)::interval`)} AS end_at,
            ${toInstant(`date_trunc($1, ${day}) - ('1 ' || $1)::interval`)} AS prev_start_at,
            ((date_trunc($1, ${day}) + ('1 ' || $1)::interval)::date - date_trunc($1, ${day})::date)::int AS days`,
    [period, ref]
  );
  return bounds.rows[0];
}

/** Earned money of the three sources inside [$1, $2), one row per receipt. */
const EARNED_IN_WINDOW = `
  SELECT COALESCE(paid_at, created_at) AS ts, total AS value, 'shop' AS source,
         COALESCE(payment_method, 'other') AS method
  FROM orders
  WHERE status IN ${EARNED_ORDER_STATUSES}
    AND COALESCE(paid_at, created_at) >= $1 AND COALESCE(paid_at, created_at) < $2
  UNION ALL
  SELECT paid_at, amount, 'club', method
  FROM payments
  WHERE status = 'paid' AND paid_at >= $1 AND paid_at < $2
  UNION ALL
  -- Tickets are paid by PIX only (Pagar.me, or the static code before it).
  SELECT ${TICKET_PAID_AT}, total_cents::numeric / 100, 'tickets', 'pix'
  FROM event_reservations
  WHERE ${TICKET_EARNED} AND ${TICKET_PAID_AT} >= $1 AND ${TICKET_PAID_AT} < $2`;

/**
 * Everything about one period in a single call — the screen, the PDF and the
 * spreadsheet all read this, so they never disagree about a number.
 */
export async function getOverviewReport(
  period: OverviewPeriod,
  reference?: string,
  range?: OverviewRange
): Promise<OverviewReport> {
  const { start_at: startAt, end_at: endAt, prev_start_at: prevStartAt, days: rawDays } = await resolveBounds(
    period,
    reference,
    range
  );
  const days = Number(rawDays) || 1;
  const bucket: 'day' | 'month' = days <= DAILY_SERIES_MAX_DAYS ? 'day' : 'month';

  const salesSql = `
    SELECT
      COUNT(*) FILTER (WHERE status IN ${EARNED_ORDER_STATUSES})::int AS orders,
      COALESCE(SUM(total) FILTER (WHERE status IN ${EARNED_ORDER_STATUSES}), 0)::float AS revenue,
      COALESCE(SUM(subtotal) FILTER (WHERE status IN ${EARNED_ORDER_STATUSES}), 0)::float AS subtotal,
      COALESCE(SUM(discount) FILTER (WHERE status IN ${EARNED_ORDER_STATUSES}), 0)::float AS discount,
      COALESCE(SUM(shipping_cost) FILTER (WHERE status IN ${EARNED_ORDER_STATUSES}), 0)::float AS shipping,
      COALESCE(SUM(store_credit_applied) FILTER (WHERE status IN ${EARNED_ORDER_STATUSES}), 0)::float AS store_credit,
      COUNT(*) FILTER (WHERE status IN ${EARNED_ORDER_STATUSES} AND channel = 'retail')::int AS retail_orders,
      COALESCE(SUM(total) FILTER (WHERE status IN ${EARNED_ORDER_STATUSES} AND channel = 'retail'), 0)::float AS retail_revenue,
      COUNT(*) FILTER (WHERE status IN ${EARNED_ORDER_STATUSES} AND channel = 'wholesale')::int AS wholesale_orders,
      COALESCE(SUM(total) FILTER (WHERE status IN ${EARNED_ORDER_STATUSES} AND channel = 'wholesale'), 0)::float AS wholesale_revenue,
      COUNT(*) FILTER (WHERE status IN ${EARNED_ORDER_STATUSES} AND payment_method = 'pix')::int AS pix_orders,
      COUNT(*) FILTER (WHERE status IN ${EARNED_ORDER_STATUSES} AND payment_method = 'credit_card')::int AS card_orders,
      COALESCE(SUM(total) FILTER (WHERE status IN ${EARNED_ORDER_STATUSES} AND payment_method = 'pix'), 0)::float AS pix_revenue,
      COALESCE(SUM(total) FILTER (WHERE status IN ${EARNED_ORDER_STATUSES} AND payment_method = 'credit_card'), 0)::float AS card_revenue,
      -- Money that did not come in, kept apart from revenue: what is still
      -- waiting, what was given up and what went back to the customer.
      COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_orders,
      COALESCE(SUM(total) FILTER (WHERE status = 'pending'), 0)::float AS pending_value,
      COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_orders,
      COALESCE(SUM(total) FILTER (WHERE status = 'cancelled'), 0)::float AS cancelled_value,
      COUNT(*) FILTER (WHERE status = 'refunded')::int AS refunded_orders,
      COALESCE(SUM(total) FILTER (WHERE status = 'refunded'), 0)::float AS refunded_value
    FROM orders
    WHERE COALESCE(paid_at, created_at) >= $1 AND COALESCE(paid_at, created_at) < $2`;

  const ticketSql = `
    SELECT COALESCE(SUM(total_cents), 0)::float / 100 AS revenue,
           COUNT(*)::int AS reservations,
           COALESCE(SUM(quantity), 0)::int AS tickets
    FROM event_reservations
    WHERE ${TICKET_EARNED} AND ${TICKET_PAID_AT} >= $1 AND ${TICKET_PAID_AT} < $2`;

  const empty = { rows: [{}] as Record<string, unknown>[] };
  const none = { rows: [] as Record<string, unknown>[] };

  const [
    sales,
    club,
    top,
    itemTotals,
    margin,
    inventory,
    catalog,
    previous,
    tickets,
    previousTickets,
    series,
    byMethod,
    byCategory,
    ranking,
    ledger,
  ] = await Promise.all([
    query(salesSql, [startAt, endAt]).catch(() => empty),
    query(
      `SELECT
         (SELECT COALESCE(SUM(amount), 0) FROM payments
           WHERE status = 'paid' AND paid_at >= $1 AND paid_at < $2)::float AS revenue,
         (SELECT COUNT(*) FROM payments
           WHERE status = 'paid' AND paid_at >= $1 AND paid_at < $2)::int AS payments,
         (SELECT COALESCE(SUM(amount), 0) FROM payments
           WHERE status = 'refunded' AND COALESCE(paid_at, created_at) >= $1 AND COALESCE(paid_at, created_at) < $2)::float AS refunded,
         (SELECT COUNT(*) FROM payments
           WHERE status = 'refunded' AND COALESCE(paid_at, created_at) >= $1 AND COALESCE(paid_at, created_at) < $2)::int AS refunded_payments,
         (SELECT COUNT(*) FROM members
           WHERE activated_at >= $1 AND activated_at < $2)::int AS new_members,
         (SELECT COUNT(*) FROM members WHERE status = 'active')::int AS active_members,
         (SELECT COUNT(*) FROM members
           WHERE status = 'expired' AND expiry_date >= $1::date AND expiry_date < $2::date)::int AS expired_in_period`,
      [startAt, endAt]
    ).catch(() => empty),
    // Ranked by revenue, not units: the manager reorders by what pays, and a
    // cheap SKU can outsell a profitable one without deserving the shelf.
    query(
      `SELECT oi.product_name AS name,
              SUM(oi.quantity)::int AS quantity,
              SUM(${NET_LINE})::float AS revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.status IN ${EARNED_ORDER_STATUSES}
         AND COALESCE(o.paid_at, o.created_at) >= $1 AND COALESCE(o.paid_at, o.created_at) < $2
       GROUP BY oi.product_name
       ORDER BY revenue DESC, quantity DESC
       LIMIT 10`,
      [startAt, endAt]
    ).catch(() => none),
    // Totals over the whole period — the top-10 is a ranking, not a sum.
    query(
      `SELECT COALESCE(SUM(oi.quantity), 0)::int AS units_sold,
              COUNT(DISTINCT oi.product_name)::int AS distinct_products
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.status IN ${EARNED_ORDER_STATUSES}
         AND COALESCE(o.paid_at, o.created_at) >= $1 AND COALESCE(o.paid_at, o.created_at) < $2`,
      [startAt, endAt]
    ).catch(() => empty),
    // COGS and margin for the period. `unit_cost` is the snapshot written at
    // sale time (migration 022), so a supplier price rise today does not rewrite
    // March's margin. A line without cost stays out of the sum and is counted
    // separately — an unknown cost must not become profit by omission.
    query(
      `SELECT
         COALESCE(SUM(oi.unit_cost * oi.quantity) FILTER (WHERE oi.unit_cost IS NOT NULL), 0)::float AS cogs,
         COALESCE(SUM(${NET_LINE}) FILTER (WHERE oi.unit_cost IS NOT NULL), 0)::float AS revenue_with_cost,
         COALESCE(SUM(${NET_LINE}) FILTER (WHERE oi.unit_cost IS NULL), 0)::float AS revenue_without_cost,
         COALESCE(SUM(oi.quantity) FILTER (WHERE oi.unit_cost IS NULL), 0)::int AS units_without_cost
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.status IN ${EARNED_ORDER_STATUSES}
         AND COALESCE(o.paid_at, o.created_at) >= $1 AND COALESCE(o.paid_at, o.created_at) < $2`,
      [startAt, endAt]
    ).catch(() => empty),
    // Tied-up value: how much money is sitting on the shelf right now. It is
    // the other half the cost column unlocks — revenue never says this.
    query(
      `SELECT
         COALESCE(SUM(s.stock * s.cost_price) FILTER (WHERE s.cost_price IS NOT NULL), 0)::float AS inventory_value,
         COUNT(*) FILTER (WHERE s.cost_price IS NULL)::int AS products_without_cost
       FROM (
         SELECT p.stock, p.cost_price, p.active, p.name AS product_name
         FROM products p WHERE p.has_variants = FALSE
         UNION ALL
         SELECT v.stock, COALESCE(v.cost_price, p.cost_price) AS cost_price, (p.active AND v.active), p.name
         FROM product_variants v JOIN products p ON p.id = v.product_id
       ) s
       WHERE s.active = TRUE AND s.product_name NOT ILIKE 'checkup%'`
    ).catch(() => empty),
    // Point-in-time, not period: "what is on the shelf right now".
    query(
      `SELECT COUNT(*)::int AS active_skus,
              COUNT(*) FILTER (WHERE s.stock <= 0)::int AS out_of_stock,
              COUNT(*) FILTER (WHERE s.stock > 0 AND s.stock <= s.low_stock_threshold)::int AS low_stock
       FROM (
         SELECT p.stock, p.low_stock_threshold, p.active, p.name AS product_name
         FROM products p WHERE p.has_variants = FALSE
         UNION ALL
         SELECT v.stock, p.low_stock_threshold, (p.active AND v.active), p.name
         FROM product_variants v JOIN products p ON p.id = v.product_id
       ) s
       WHERE s.active = TRUE AND s.product_name NOT ILIKE 'checkup%'`
    ).catch(() => empty),
    query(
      `SELECT
         (SELECT COALESCE(SUM(total), 0) FROM orders
           WHERE status IN ${EARNED_ORDER_STATUSES}
             AND COALESCE(paid_at, created_at) >= $1 AND COALESCE(paid_at, created_at) < $2)::float AS sales_revenue,
         (SELECT COUNT(*) FROM orders
           WHERE status IN ${EARNED_ORDER_STATUSES}
             AND COALESCE(paid_at, created_at) >= $1 AND COALESCE(paid_at, created_at) < $2)::int AS orders,
         (SELECT COALESCE(SUM(amount), 0) FROM payments
           WHERE status = 'paid' AND paid_at >= $1 AND paid_at < $2)::float AS club_revenue,
         (SELECT COUNT(*) FROM members
           WHERE activated_at >= $1 AND activated_at < $2)::int AS new_members`,
      [prevStartAt, startAt]
    ).catch(() => empty),
    query(ticketSql, [startAt, endAt]).catch(() => empty),
    query(ticketSql, [prevStartAt, startAt]).catch(() => empty),
    // A continuous axis (zeros on quiet days), cut on the Rio calendar.
    query(
      `WITH earned AS (${EARNED_IN_WINDOW}),
       buckets AS (
         SELECT generate_series(
           date_trunc($3, ($1::timestamptz AT TIME ZONE '${BUSINESS_TZ}')),
           ($2::timestamptz AT TIME ZONE '${BUSINESS_TZ}') - INTERVAL '1 second',
           ('1 ' || $3)::interval
         ) AS b
       ),
       grouped AS (
         SELECT date_trunc($3, ${local('ts')}) AS b,
                COALESCE(SUM(value) FILTER (WHERE source = 'shop'), 0)::float AS shop,
                COALESCE(SUM(value) FILTER (WHERE source = 'club'), 0)::float AS club,
                COALESCE(SUM(value) FILTER (WHERE source = 'tickets'), 0)::float AS tickets,
                COUNT(*) FILTER (WHERE source = 'shop')::int AS orders
         FROM earned GROUP BY 1
       )
       SELECT TO_CHAR(bk.b, 'YYYY-MM-DD') AS date,
              COALESCE(g.shop, 0)::float AS shop,
              COALESCE(g.club, 0)::float AS club,
              COALESCE(g.tickets, 0)::float AS tickets,
              COALESCE(g.orders, 0)::int AS orders
       FROM buckets bk LEFT JOIN grouped g ON g.b = bk.b
       ORDER BY bk.b`,
      [startAt, endAt, bucket]
    ).catch(() => none),
    query(
      `SELECT method, COUNT(*)::int AS count, COALESCE(SUM(value), 0)::float AS revenue
       FROM (${EARNED_IN_WINDOW}) e
       GROUP BY method
       ORDER BY revenue DESC`,
      [startAt, endAt]
    ).catch(() => none),
    query(
      `SELECT COALESCE(c.name, 'Sem categoria') AS name,
              SUM(oi.quantity)::int AS quantity,
              SUM(${NET_LINE})::float AS revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN products p ON p.id = oi.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE o.status IN ${EARNED_ORDER_STATUSES}
         AND COALESCE(o.paid_at, o.created_at) >= $1 AND COALESCE(o.paid_at, o.created_at) < $2
       GROUP BY 1
       ORDER BY revenue DESC`,
      [startAt, endAt]
    ).catch(() => none),
    // The whole list, with cost: the spreadsheet's product sheet. Cost is null
    // when any line of the product lacks it — a partial cost reads as profit.
    query(
      `SELECT oi.product_name AS name,
              SUM(oi.quantity)::int AS quantity,
              SUM(${NET_LINE})::float AS revenue,
              CASE WHEN bool_and(oi.unit_cost IS NOT NULL)
                THEN SUM(oi.unit_cost * oi.quantity)::float END AS cost
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.status IN ${EARNED_ORDER_STATUSES}
         AND COALESCE(o.paid_at, o.created_at) >= $1 AND COALESCE(o.paid_at, o.created_at) < $2
       GROUP BY oi.product_name
       ORDER BY revenue DESC, quantity DESC
       LIMIT 500`,
      [startAt, endAt]
    ).catch(() => none),
    // One row per sale: shop orders (every state, flagged), club payments that
    // were paid or refunded, and ticket reservations that carry a price.
    query(
      `SELECT * FROM (
         SELECT 'shop' AS kind, o.id::text AS id, '#' || o.order_number AS reference,
                COALESCE(o.paid_at, o.created_at) AS at, o.customer_name AS customer,
                COALESCE((SELECT string_agg(oi.quantity || 'x ' || oi.product_name, '; ')
                          FROM order_items oi WHERE oi.order_id = o.id), '') AS description,
                o.payment_method AS method, o.channel, o.installments::int AS installments, o.status,
                o.subtotal::float AS subtotal, o.discount::float AS discount,
                o.shipping_cost::float AS shipping, o.total::float AS total,
                (o.status IN ${EARNED_ORDER_STATUSES}) AS counted
         FROM orders o
         WHERE COALESCE(o.paid_at, o.created_at) >= $1 AND COALESCE(o.paid_at, o.created_at) < $2
         UNION ALL
         SELECT 'club', p.id::text, 'Clube', COALESCE(p.paid_at, p.created_at), COALESCE(m.full_name, '-'),
                'Anuidade do clube', p.method, NULL, p.installments::int, p.status,
                p.amount::float, 0, 0, p.amount::float, (p.status = 'paid' AND p.paid_at IS NOT NULL)
         FROM payments p LEFT JOIN members m ON m.id = p.member_id
         WHERE p.status IN ('paid', 'refunded')
           AND COALESCE(p.paid_at, p.created_at) >= $1 AND COALESCE(p.paid_at, p.created_at) < $2
         UNION ALL
         SELECT 'ticket', r.id::text, r.code, r.at, r.buyer_name,
                r.quantity || ' ingresso(s) - ' || COALESCE(ev.title, r.event_id),
                'pix', NULL, NULL, r.status,
                r.total_cents::float / 100, 0, 0, r.total_cents::float / 100, r.counted
         FROM (
           SELECT er.*, COALESCE(er.paid_at, er.confirmed_at, er.created_at) AS at, (${TICKET_EARNED}) AS counted
           FROM event_reservations er WHERE er.total_cents > 0
         ) r
         LEFT JOIN events ev ON ev.id = r.event_id
         WHERE r.at >= $1 AND r.at < $2
       ) ledger
       ORDER BY at DESC
       LIMIT ${LEDGER_LIMIT + 1}`,
      [startAt, endAt]
    ).catch((err) => {
      log.error({ err }, 'sales ledger failed');
      return none;
    }),
  ]);

  const s = sales.rows[0] || {};
  const c = club.rows[0] || {};
  const cat = catalog.rows[0] || {};
  const totals = itemTotals.rows[0] || {};
  const mg = margin.rows[0] || {};
  const inv = inventory.rows[0] || {};
  const p = previous.rows[0] || {};
  const t = tickets.rows[0] || {};
  const pt = previousTickets.rows[0] || {};
  const n = (value: unknown) => Number(value) || 0;

  const orders = n(s.orders);
  const revenue = n(s.revenue);
  const topRows = (top.rows || []).map((row: Record<string, unknown>) => ({
    name: String(row.name ?? ''),
    quantity: n(row.quantity),
    revenue: n(row.revenue),
  }));
  const ledgerRows = (ledger.rows || []).filter((row: Record<string, unknown>) => row.kind && row.at);

  return {
    period: {
      type: period,
      start: iso(startAt),
      end: iso(endAt),
      previousStart: iso(prevStartAt),
      days,
    },
    sales: {
      orders,
      revenue,
      averageTicket: orders > 0 ? revenue / orders : 0,
      subtotal: n(s.subtotal),
      discount: n(s.discount),
      shipping: n(s.shipping),
      storeCredit: n(s.store_credit),
      retailOrders: n(s.retail_orders),
      retailRevenue: n(s.retail_revenue),
      wholesaleOrders: n(s.wholesale_orders),
      wholesaleRevenue: n(s.wholesale_revenue),
      pixOrders: n(s.pix_orders),
      cardOrders: n(s.card_orders),
      pixRevenue: n(s.pix_revenue),
      cardRevenue: n(s.card_revenue),
      pendingOrders: n(s.pending_orders),
      pendingRevenue: n(s.pending_value),
      cancelledOrders: n(s.cancelled_orders),
      cancelledRevenue: n(s.cancelled_value),
      refundedOrders: n(s.refunded_orders),
      refundedRevenue: n(s.refunded_value),
    },
    club: {
      revenue: n(c.revenue),
      payments: n(c.payments),
      newMembers: n(c.new_members),
      activeMembers: n(c.active_members),
      expiredInPeriod: n(c.expired_in_period),
      refunded: n(c.refunded),
      refundedPayments: n(c.refunded_payments),
    },
    tickets: { revenue: n(t.revenue), reservations: n(t.reservations), tickets: n(t.tickets) },
    margin: (() => {
      const cogs = n(mg.cogs);
      const revenueWithCost = n(mg.revenue_with_cost);
      const revenueWithoutCost = n(mg.revenue_without_cost);
      const grossProfit = revenueWithCost - cogs;
      const covered = revenueWithCost + revenueWithoutCost;
      return {
        cogs,
        grossProfit,
        // Percentage over what has a known cost — dividing by total revenue
        // would dilute the margin with sales that never entered the sum.
        marginPct: revenueWithCost > 0 ? (grossProfit / revenueWithCost) * 100 : 0,
        revenueWithCost,
        revenueWithoutCost,
        costCoveragePct: covered > 0 ? (revenueWithCost / covered) * 100 : 0,
        unitsWithoutCost: n(mg.units_without_cost),
        inventoryValue: n(inv.inventory_value),
        productsWithoutCost: n(inv.products_without_cost),
      };
    })(),
    products: {
      unitsSold: n(totals.units_sold),
      distinctProducts: n(totals.distinct_products),
      top: topRows,
      ranking: (ranking.rows || []).map((row: Record<string, unknown>) => ({
        name: String(row.name ?? ''),
        quantity: n(row.quantity),
        revenue: n(row.revenue),
        cost: row.cost === null || row.cost === undefined ? null : n(row.cost),
      })),
      activeSkus: n(cat.active_skus),
      outOfStock: n(cat.out_of_stock),
      lowStock: n(cat.low_stock),
    },
    series: {
      bucket,
      points: (series.rows || []).map((row: Record<string, unknown>) => {
        const shop = n(row.shop);
        const clubValue = n(row.club);
        const ticketValue = n(row.tickets);
        return {
          date: String(row.date ?? ''),
          shop,
          club: clubValue,
          tickets: ticketValue,
          total: shop + clubValue + ticketValue,
          orders: n(row.orders),
        };
      }),
    },
    byMethod: (byMethod.rows || []).map((row: Record<string, unknown>) => ({
      method: toMethod(row.method),
      count: n(row.count),
      revenue: n(row.revenue),
    })),
    byCategory: (byCategory.rows || []).map((row: Record<string, unknown>) => ({
      name: String(row.name ?? ''),
      quantity: n(row.quantity),
      revenue: n(row.revenue),
    })),
    ledger: {
      entries: ledgerRows.slice(0, LEDGER_LIMIT).map((row: Record<string, unknown>) => ({
        kind: row.kind as LedgerEntry['kind'],
        id: String(row.id ?? ''),
        reference: String(row.reference ?? ''),
        at: iso(row.at),
        customer: String(row.customer ?? ''),
        description: String(row.description ?? ''),
        method: toMethod(row.method),
        channel: row.channel ? String(row.channel) : null,
        installments: row.installments === null || row.installments === undefined ? null : n(row.installments),
        status: String(row.status ?? ''),
        subtotal: n(row.subtotal),
        discount: n(row.discount),
        shipping: n(row.shipping),
        total: n(row.total),
        counted: row.counted === true,
      })),
      truncated: ledgerRows.length > LEDGER_LIMIT,
    },
    previous: {
      salesRevenue: n(p.sales_revenue),
      clubRevenue: n(p.club_revenue),
      ticketRevenue: n(pt.revenue),
      orders: n(p.orders),
      newMembers: n(p.new_members),
    },
  };
}
