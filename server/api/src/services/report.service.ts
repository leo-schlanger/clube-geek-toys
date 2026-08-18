import { query } from '../config/database.js';

/**
 * Reports service — real aggregates from members, payments and shop orders.
 *
 * Contract (frontend expects):
 *  monthly: { month, revenue, paymentCount, newMembers, churnedMembers, shopRevenue? }
 *  churn:   { period, churnRate, churned, total }
 *  plan:    { plan, count, revenue, percentage }[]
 *  realtime-stats: members.* + payments.month_revenue + payments.today_revenue
 */

function clampMonths(months: number): number {
  const n = Number.isFinite(months) ? Math.trunc(months) : 6;
  return Math.max(1, Math.min(n, 24));
}

/** Inclusive month series from (now - months + 1) .. current month (YYYY-MM). */
function monthSeriesSql(paramIndex: number): string {
  // $N = months window
  return `
    SELECT
      TO_CHAR(d, 'YYYY-MM') AS month,
      date_trunc('month', d)::timestamptz AS month_start,
      (date_trunc('month', d) + INTERVAL '1 month')::timestamptz AS month_end
    FROM generate_series(
      date_trunc('month', NOW() - (($${paramIndex}::int - 1) * INTERVAL '1 month')),
      date_trunc('month', NOW()),
      INTERVAL '1 month'
    ) AS d
  `;
}

export async function getDailyReport() {
  const today = new Date().toISOString().split('T')[0];

  const [revenue, members, shop] = await Promise.all([
    query(
      `SELECT COALESCE(SUM(amount), 0)::float AS total, COUNT(*)::int AS count
       FROM payments WHERE status = 'paid' AND paid_at IS NOT NULL AND paid_at::date = $1`,
      [today]
    ),
    query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'active')::int AS active,
         COUNT(*) FILTER (WHERE created_at::date = $1)::int AS new_today
       FROM members`,
      [today]
    ),
    query(
      `SELECT COALESCE(SUM(total), 0)::float AS total, COUNT(*)::int AS count
       FROM orders
       WHERE status IN ('paid', 'processing', 'shipped', 'delivered')
         AND COALESCE(paid_at, created_at)::date = $1`,
      [today]
    ).catch(() => ({ rows: [{ total: 0, count: 0 }] })),
  ]);

  return {
    date: today,
    revenue: { total: revenue.rows[0].total, paymentCount: revenue.rows[0].count },
    shop: { total: shop.rows[0].total, orderCount: shop.rows[0].count },
    members: members.rows[0],
  };
}

/**
 * Monthly report with a continuous month axis (zeros when empty).
 * Revenue = paid club payments; newMembers = cadastros; churned = expired/inactive that month.
 * shopRevenue = paid shop orders that month (when table exists).
 */
export async function getMonthlyReport(months: number) {
  const window = clampMonths(months);

  const result = await query(
    `
    WITH months AS (${monthSeriesSql(1)}),
    revenue AS (
      SELECT
        TO_CHAR(paid_at, 'YYYY-MM') AS month,
        COALESCE(SUM(amount), 0)::float AS revenue,
        COUNT(*)::int AS payment_count
      FROM payments
      WHERE status = 'paid'
        AND paid_at IS NOT NULL
        AND paid_at >= date_trunc('month', NOW() - (($1::int - 1) * INTERVAL '1 month'))
      GROUP BY 1
    ),
    new_members AS (
      SELECT
        TO_CHAR(created_at, 'YYYY-MM') AS month,
        COUNT(*)::int AS new_members
      FROM members
      WHERE created_at >= date_trunc('month', NOW() - (($1::int - 1) * INTERVAL '1 month'))
      GROUP BY 1
    ),
    churned AS (
      SELECT
        TO_CHAR(updated_at, 'YYYY-MM') AS month,
        COUNT(*)::int AS churned_members
      FROM members
      WHERE status IN ('expired', 'inactive')
        AND updated_at >= date_trunc('month', NOW() - (($1::int - 1) * INTERVAL '1 month'))
      GROUP BY 1
    ),
    shop AS (
      SELECT
        TO_CHAR(COALESCE(paid_at, created_at), 'YYYY-MM') AS month,
        COALESCE(SUM(total), 0)::float AS shop_revenue,
        COUNT(*)::int AS shop_orders
      FROM orders
      WHERE status IN ('paid', 'processing', 'shipped', 'delivered')
        AND COALESCE(paid_at, created_at) >= date_trunc('month', NOW() - (($1::int - 1) * INTERVAL '1 month'))
      GROUP BY 1
    )
    SELECT
      m.month,
      COALESCE(r.revenue, 0)::float AS revenue,
      COALESCE(r.payment_count, 0)::int AS payment_count,
      COALESCE(n.new_members, 0)::int AS new_members,
      COALESCE(c.churned_members, 0)::int AS churned_members,
      COALESCE(s.shop_revenue, 0)::float AS shop_revenue,
      COALESCE(s.shop_orders, 0)::int AS shop_orders
    FROM months m
    LEFT JOIN revenue r ON r.month = m.month
    LEFT JOIN new_members n ON n.month = m.month
    LEFT JOIN churned c ON c.month = m.month
    LEFT JOIN shop s ON s.month = m.month
    ORDER BY m.month ASC
    `,
    [window]
  ).catch(async (err: { message?: string }) => {
    // Fallback if orders table missing (pre-shop environments)
    if (err?.message && /orders/i.test(err.message)) {
      return query(
        `
        WITH months AS (${monthSeriesSql(1)}),
        revenue AS (
          SELECT
            TO_CHAR(paid_at, 'YYYY-MM') AS month,
            COALESCE(SUM(amount), 0)::float AS revenue,
            COUNT(*)::int AS payment_count
          FROM payments
          WHERE status = 'paid'
            AND paid_at IS NOT NULL
            AND paid_at >= date_trunc('month', NOW() - (($1::int - 1) * INTERVAL '1 month'))
          GROUP BY 1
        ),
        new_members AS (
          SELECT
            TO_CHAR(created_at, 'YYYY-MM') AS month,
            COUNT(*)::int AS new_members
          FROM members
          WHERE created_at >= date_trunc('month', NOW() - (($1::int - 1) * INTERVAL '1 month'))
          GROUP BY 1
        ),
        churned AS (
          SELECT
            TO_CHAR(updated_at, 'YYYY-MM') AS month,
            COUNT(*)::int AS churned_members
          FROM members
          WHERE status IN ('expired', 'inactive')
            AND updated_at >= date_trunc('month', NOW() - (($1::int - 1) * INTERVAL '1 month'))
          GROUP BY 1
        )
        SELECT
          m.month,
          COALESCE(r.revenue, 0)::float AS revenue,
          COALESCE(r.payment_count, 0)::int AS payment_count,
          COALESCE(n.new_members, 0)::int AS new_members,
          COALESCE(c.churned_members, 0)::int AS churned_members,
          0::float AS shop_revenue,
          0::int AS shop_orders
        FROM months m
        LEFT JOIN revenue r ON r.month = m.month
        LEFT JOIN new_members n ON n.month = m.month
        LEFT JOIN churned c ON c.month = m.month
        ORDER BY m.month ASC
        `,
        [window]
      );
    }
    throw err;
  });

  return result.rows.map((row) => ({
    month: row.month as string,
    revenue: Number(row.revenue) || 0,
    paymentCount: Number(row.payment_count) || 0,
    newMembers: Number(row.new_members) || 0,
    churnedMembers: Number(row.churned_members) || 0,
    shopRevenue: Number(row.shop_revenue) || 0,
    shopOrders: Number(row.shop_orders) || 0,
  }));
}

/**
 * Churn per month for the UI:
 *  period, churned, total (base at month start), churnRate (%)
 *
 * Base ≈ members that were still "in the club" at the start of the month
 * (active, or left during/after that month). Pending never-paid are excluded.
 */
export async function getChurnReport(months: number = 6) {
  const window = clampMonths(months);

  const result = await query(
    `
    WITH months AS (${monthSeriesSql(1)}),
    churned AS (
      SELECT
        TO_CHAR(updated_at, 'YYYY-MM') AS month,
        COUNT(*)::int AS churned
      FROM members
      WHERE status IN ('expired', 'inactive')
        AND updated_at >= date_trunc('month', NOW() - (($1::int - 1) * INTERVAL '1 month'))
      GROUP BY 1
    ),
    base AS (
      SELECT
        m.month,
        COUNT(mem.id)::int AS total
      FROM months m
      LEFT JOIN members mem
        ON mem.created_at < m.month_start
        AND mem.status IN ('active', 'expired', 'inactive')
        AND (
          mem.status = 'active'
          OR mem.updated_at >= m.month_start
        )
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
  const [club, shop] = await Promise.all([
    query(
      `SELECT COALESCE(SUM(amount), 0)::float AS total, COUNT(*)::int AS count
       FROM payments
       WHERE status = 'paid' AND paid_at IS NOT NULL AND paid_at::date = CURRENT_DATE`
    ),
    query(
      `SELECT COALESCE(SUM(total), 0)::float AS total, COUNT(*)::int AS count
       FROM orders
       WHERE status IN ('paid', 'processing', 'shipped', 'delivered')
         AND COALESCE(paid_at, created_at)::date = CURRENT_DATE`
    ).catch(() => ({ rows: [{ total: 0, count: 0 }] })),
  ]);

  return {
    total: club.rows[0].total,
    paymentCount: club.rows[0].count,
    shopTotal: shop.rows[0].total,
    shopOrderCount: shop.rows[0].count,
    date: new Date().toISOString().split('T')[0],
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

export async function getRealtimeStats() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  // Copy before mutating for week start (Sunday-based, consistent with prior behavior)
  const weekRef = new Date(now);
  weekRef.setDate(weekRef.getDate() - weekRef.getDay());
  weekRef.setHours(0, 0, 0, 0);
  const startOfWeek = weekRef.toISOString();
  const startOfDay = new Date().toISOString().split('T')[0];

  const [members, payments, shop] = await Promise.all([
    query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE status = 'expired')::int AS expired,
        COUNT(*) FILTER (WHERE status = 'inactive')::int AS inactive,
        COUNT(*) FILTER (WHERE created_at::date = $1)::int AS new_today,
        COUNT(*) FILTER (WHERE created_at >= $2)::int AS new_this_week
      FROM members`,
      [startOfDay, startOfWeek]
    ),
    query(
      `
      SELECT
        COALESCE(SUM(amount) FILTER (
          WHERE status = 'paid' AND paid_at IS NOT NULL AND paid_at >= $1
        ), 0)::float AS month_revenue,
        COUNT(*) FILTER (
          WHERE status = 'paid' AND paid_at IS NOT NULL AND paid_at >= $1
        )::int AS month_payments,
        COALESCE(SUM(amount) FILTER (
          WHERE status = 'paid' AND paid_at IS NOT NULL AND paid_at::date = $2
        ), 0)::float AS today_revenue,
        COUNT(*) FILTER (
          WHERE status = 'paid' AND paid_at IS NOT NULL AND paid_at::date = $2
        )::int AS today_payments
      FROM payments`,
      [startOfMonth, startOfDay]
    ),
    query(
      `
      SELECT
        COALESCE(SUM(total) FILTER (
          WHERE status IN ('paid','processing','shipped','delivered')
            AND COALESCE(paid_at, created_at) >= $1
        ), 0)::float AS month_shop_revenue,
        COUNT(*) FILTER (
          WHERE status IN ('paid','processing','shipped','delivered')
            AND COALESCE(paid_at, created_at) >= $1
        )::int AS month_shop_orders,
        COALESCE(SUM(total) FILTER (
          WHERE status IN ('paid','processing','shipped','delivered')
            AND COALESCE(paid_at, created_at)::date = $2
        ), 0)::float AS today_shop_revenue
      FROM orders`,
      [startOfMonth, startOfDay]
    ).catch(() => ({
      rows: [{ month_shop_revenue: 0, month_shop_orders: 0, today_shop_revenue: 0 }],
    })),
  ]);

  return {
    members: members.rows[0],
    payments: payments.rows[0],
    shop: shop.rows[0],
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
    console.error(`[REPORTS] action item "${key}" failed:`, err);
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
    queueStat('to_ship', queueSql('orders', `status = 'processing'`, 'updated_at')),
    // No shipped_at column exists; for a shipped order the last write is the
    // tracking save, so updated_at is the closest thing to "posted on".
    queueStat(
      'shipped_stale',
      queueSql('orders', `status = 'shipped' AND updated_at < NOW() - INTERVAL '${SHIPPED_STALE_DAYS} days'`, 'updated_at')
    ),
    queueStat('questions_unanswered', queueSql('product_questions', `answered_at IS NULL AND status = 'published'`)),
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
