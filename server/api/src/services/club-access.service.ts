import { CLUB_PLAN_PRICE } from '../types/index.js';

/** Anything with a `query` — the pool helper or a transaction client. */
interface Db {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * The period one club payment bought.
 *
 * The plan was monthly (R$ 12,50 / R$ 19,90) until 02/10/2026 and is annual
 * since, so the amount tells the two apart without a column for it.
 */
export function clubPeriodForAmount(amount: number): '1 year' | '1 month' {
  return amount >= CLUB_PLAN_PRICE / 2 ? '1 year' : '1 month';
}

/**
 * A refunded club payment takes back the period it bought.
 *
 * With a single payment that ends the membership today: the member goes
 * `inactive` and `expiry_date` becomes today, which is how the reports date the
 * exit. Two payments buy two periods (a second PIX is a second year, by
 * decision), so refunding one leaves the other standing.
 *
 * Callers run it only when they are the ones who flipped the payment to
 * `refunded`, so a refund arriving by webhook and by the panel at once takes
 * the period back once. Returns the subscription to cancel when access ended,
 * so a refunded member is not charged again next cycle.
 */
export async function revokeRefundedPeriod(
  db: Db,
  memberId: string,
  amount: number,
): Promise<{ ended: boolean; subscriptionId: string | null } | null> {
  const result = await db.query(
    `UPDATE members
        SET expiry_date = CASE
              WHEN (expiry_date - $2::interval)::date > CURRENT_DATE
                THEN (expiry_date - $2::interval)::date
              ELSE CURRENT_DATE END,
            status = CASE
              WHEN (expiry_date - $2::interval)::date > CURRENT_DATE THEN status
              ELSE 'inactive' END,
            auto_renewal = CASE
              WHEN (expiry_date - $2::interval)::date > CURRENT_DATE THEN auto_renewal
              ELSE FALSE END,
            payment_count = GREATEST(payment_count - 1, 0),
            updated_at = NOW()
      WHERE id = $1 AND status = 'active' AND expiry_date IS NOT NULL
      RETURNING status, subscription_id, subscription_status`,
    [memberId, clubPeriodForAmount(amount)],
  );
  const row = result.rows[0];
  if (!row) return null;
  const ended = row.status === 'inactive';
  const liveSubscription =
    ended && row.subscription_id && !['cancelled', 'canceled'].includes(String(row.subscription_status))
      ? (row.subscription_id as string)
      : null;
  return { ended, subscriptionId: liveSubscription };
}
