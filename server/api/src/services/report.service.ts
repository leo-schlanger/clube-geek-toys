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
         COUNT(*) FILTER (WHERE ${local('created_at')}::date = ${TODAY_LOCAL})::int AS new_today
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
    new_members AS (
      SELECT TO_CHAR(${local('created_at')}, 'YYYY-MM') AS month, COUNT(*)::int AS new_members
      FROM members
      WHERE created_at >= ${windowStart(1)}
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
      SELECT id, created_at, status, ${MEMBER_EXIT_AT} AS exit_at
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
        ON e.created_at < m.month_start
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
        COUNT(*) FILTER (WHERE ${local('created_at')}::date = ${TODAY_LOCAL})::int AS new_today,
        COUNT(*) FILTER (WHERE created_at >= ${WEEK_START})::int AS new_this_week
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
    queueStat('to_ship', queueSql('orders', `status = 'processing'`, 'COALESCE(status_changed_at, updated_at)')),
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

/** Periods the consolidated report can be cut by. */
export type OverviewPeriod = 'day' | 'month' | 'year';

const OVERVIEW_PERIODS: OverviewPeriod[] = ['day', 'month', 'year'];

export function isOverviewPeriod(value: unknown): value is OverviewPeriod {
  return OVERVIEW_PERIODS.includes(value as OverviewPeriod);
}


export interface OverviewReport {
  period: { type: OverviewPeriod; start: string; end: string };
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
    pendingOrders: number;
    cancelledOrders: number;
    refundedOrders: number;
  };
  club: { revenue: number; payments: number; newMembers: number; activeMembers: number; expiredInPeriod: number };
  tickets: { revenue: number; reservations: number };
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
    activeSkus: number;
    outOfStock: number;
    lowStock: number;
  };
  previous: { salesRevenue: number; clubRevenue: number; ticketRevenue: number; orders: number; newMembers: number };
}

/**
 * Everything about one period in a single call — the backing data for the PDF.
 *
 * Boundaries are cut by the database (`date_trunc`) rather than in JS: the API
 * container and Postgres do not have to agree on a timezone for "yesterday" to
 * mean the same day in both. `previous` is the same window shifted back once,
 * so growth is always compared like for like (a 28-day February against a
 * 31-day January, not against a rolling 30 days).
 */
export async function getOverviewReport(period: OverviewPeriod, reference?: string): Promise<OverviewReport> {
  const ref = reference && /^\d{4}-\d{2}-\d{2}$/.test(reference) ? reference : null;

  // Cut on the Rio calendar, then turned back into instants for the columns.
  const day = `COALESCE($2::date, ${TODAY_LOCAL})::timestamp`;
  const bounds = await query(
    `SELECT ${toInstant(`date_trunc($1, ${day})`)} AS start_at,
            ${toInstant(`date_trunc($1, ${day}) + ('1 ' || $1)::interval`)} AS end_at,
            ${toInstant(`date_trunc($1, ${day}) - ('1 ' || $1)::interval`)} AS prev_start_at`,
    [period, ref]
  );
  const { start_at: startAt, end_at: endAt, prev_start_at: prevStartAt } = bounds.rows[0];

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
      COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_orders,
      COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_orders,
      COUNT(*) FILTER (WHERE status = 'refunded')::int AS refunded_orders
    FROM orders
    WHERE COALESCE(paid_at, created_at) >= $1 AND COALESCE(paid_at, created_at) < $2`;

  const ticketSql = `
    SELECT COALESCE(SUM(total_cents), 0)::float / 100 AS revenue, COUNT(*)::int AS reservations
    FROM event_reservations
    WHERE ${TICKET_EARNED} AND ${TICKET_PAID_AT} >= $1 AND ${TICKET_PAID_AT} < $2`;

  const [sales, club, top, itemTotals, margin, inventory, catalog, previous, tickets, previousTickets] = await Promise.all([
    query(salesSql, [startAt, endAt]).catch(() => ({ rows: [{}] as Record<string, unknown>[] })),
    query(
      `SELECT
         (SELECT COALESCE(SUM(amount), 0) FROM payments
           WHERE status = 'paid' AND paid_at >= $1 AND paid_at < $2)::float AS revenue,
         (SELECT COUNT(*) FROM payments
           WHERE status = 'paid' AND paid_at >= $1 AND paid_at < $2)::int AS payments,
         (SELECT COUNT(*) FROM members
           WHERE created_at >= $1 AND created_at < $2)::int AS new_members,
         (SELECT COUNT(*) FROM members WHERE status = 'active')::int AS active_members,
         (SELECT COUNT(*) FROM members
           WHERE status = 'expired' AND expiry_date >= $1::date AND expiry_date < $2::date)::int AS expired_in_period`,
      [startAt, endAt]
    ).catch(() => ({ rows: [{}] as Record<string, unknown>[] })),
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
    ).catch(() => ({ rows: [] as Record<string, unknown>[] })),
    // Totals over the whole period — the top-10 is a ranking, not a sum.
    query(
      `SELECT COALESCE(SUM(oi.quantity), 0)::int AS units_sold,
              COUNT(DISTINCT oi.product_name)::int AS distinct_products
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.status IN ${EARNED_ORDER_STATUSES}
         AND COALESCE(o.paid_at, o.created_at) >= $1 AND COALESCE(o.paid_at, o.created_at) < $2`,
      [startAt, endAt]
    ).catch(() => ({ rows: [{}] as Record<string, unknown>[] })),
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
    ).catch(() => ({ rows: [{}] as Record<string, unknown>[] })),
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
    ).catch(() => ({ rows: [{}] as Record<string, unknown>[] })),
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
    ).catch(() => ({ rows: [{}] as Record<string, unknown>[] })),
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
           WHERE created_at >= $1 AND created_at < $2)::int AS new_members`,
      [prevStartAt, startAt]
    ).catch(() => ({ rows: [{}] as Record<string, unknown>[] })),
    query(ticketSql, [startAt, endAt]).catch(() => ({ rows: [{}] as Record<string, unknown>[] })),
    query(ticketSql, [prevStartAt, startAt]).catch(() => ({ rows: [{}] as Record<string, unknown>[] })),
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

  return {
    period: { type: period, start: new Date(startAt).toISOString(), end: new Date(endAt).toISOString() },
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
      pendingOrders: n(s.pending_orders),
      cancelledOrders: n(s.cancelled_orders),
      refundedOrders: n(s.refunded_orders),
    },
    club: {
      revenue: n(c.revenue),
      payments: n(c.payments),
      newMembers: n(c.new_members),
      activeMembers: n(c.active_members),
      expiredInPeriod: n(c.expired_in_period),
    },
    tickets: { revenue: n(t.revenue), reservations: n(t.reservations) },
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
      activeSkus: n(cat.active_skus),
      outOfStock: n(cat.out_of_stock),
      lowStock: n(cat.low_stock),
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
