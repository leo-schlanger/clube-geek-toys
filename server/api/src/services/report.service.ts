import { query } from '../config/database.js';

export async function getDailyReport() {
  const today = new Date().toISOString().split('T')[0];

  const [revenue, members, points] = await Promise.all([
    query(
      `SELECT COALESCE(SUM(amount), 0)::float as total, COUNT(*)::int as count
       FROM payments WHERE status = 'paid' AND paid_at::date = $1`,
      [today]
    ),
    query(
      `SELECT
         COUNT(*)::int as total,
         COUNT(*) FILTER (WHERE status = 'active')::int as active,
         COUNT(*) FILTER (WHERE created_at::date = $1)::int as new_today,
         COUNT(*) FILTER (WHERE plan = 'silver')::int as silver,
         COUNT(*) FILTER (WHERE plan = 'gold')::int as gold,
         COUNT(*) FILTER (WHERE plan = 'black')::int as black
       FROM members`,
      [today]
    ),
    query(
      `SELECT
         COALESCE(SUM(points) FILTER (WHERE type = 'earn'), 0)::int as earned,
         COALESCE(SUM(ABS(points)) FILTER (WHERE type = 'redeem'), 0)::int as redeemed
       FROM point_transactions WHERE created_at::date = $1`,
      [today]
    ),
  ]);

  return {
    date: today,
    revenue: { total: revenue.rows[0].total, paymentCount: revenue.rows[0].count },
    members: members.rows[0],
    points: points.rows[0],
  };
}

export async function getMonthlyReport(months: number) {
  const result = await query(
    `SELECT
       TO_CHAR(paid_at, 'YYYY-MM') as month,
       COALESCE(SUM(amount), 0)::float as revenue,
       COUNT(*)::int as payment_count
     FROM payments
     WHERE status = 'paid' AND paid_at >= NOW() - INTERVAL '1 month' * $1
     GROUP BY TO_CHAR(paid_at, 'YYYY-MM')
     ORDER BY month DESC`,
    [months]
  );

  return result.rows.map((row) => ({
    month: row.month,
    revenue: row.revenue,
    paymentCount: row.payment_count,
  }));
}

export async function getRealtimeStats() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())).toISOString();
  const startOfDay = new Date().toISOString().split('T')[0];

  const [members, payments, pointsToday] = await Promise.all([
    query(`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'active')::int as active,
        COUNT(*) FILTER (WHERE status = 'pending')::int as pending,
        COUNT(*) FILTER (WHERE status = 'expired')::int as expired,
        COUNT(*) FILTER (WHERE status = 'inactive')::int as inactive,
        COUNT(*) FILTER (WHERE plan = 'silver' AND status = 'active')::int as silver,
        COUNT(*) FILTER (WHERE plan = 'gold' AND status = 'active')::int as gold,
        COUNT(*) FILTER (WHERE plan = 'black' AND status = 'active')::int as black,
        COUNT(*) FILTER (WHERE created_at::date = $1)::int as new_today,
        COUNT(*) FILTER (WHERE created_at >= $2)::int as new_this_week
      FROM members`,
      [startOfDay, startOfWeek]
    ),
    query(`
      SELECT
        COALESCE(SUM(amount), 0)::float as month_revenue,
        COUNT(*)::int as month_payments
      FROM payments
      WHERE status = 'paid' AND paid_at >= $1`,
      [startOfMonth]
    ),
    query(`
      SELECT
        COALESCE(SUM(points) FILTER (WHERE type = 'earn'), 0)::int as earned,
        COALESCE(SUM(ABS(points)) FILTER (WHERE type = 'redeem'), 0)::int as redeemed
      FROM point_transactions
      WHERE created_at::date = $1`,
      [startOfDay]
    ),
  ]);

  return {
    members: members.rows[0],
    payments: payments.rows[0],
    pointsToday: pointsToday.rows[0],
    timestamp: new Date().toISOString(),
  };
}
