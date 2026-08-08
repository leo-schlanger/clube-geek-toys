import pg from 'pg';
import { query, getClient } from '../config/database.js';
import { AppError } from '../middleware/error-handler.js';

export type CreditReason =
  | 'review_reward'
  | 'order_redeem'
  | 'admin_adjust'
  | 'order_refund_credit';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function getBalance(userId: string): Promise<number> {
  const result = await query(`SELECT balance FROM store_credits WHERE user_id = $1`, [userId]);
  if (result.rows.length === 0) return 0;
  return parseFloat(result.rows[0].balance);
}

export async function getReviewRewardAmount(): Promise<number> {
  const result = await query(`SELECT value FROM config WHERE key = 'review_reward_amount'`);
  if (result.rows.length === 0) return 1;
  const raw = result.rows[0].value;
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
  if (!Number.isFinite(n) || n < 0) return 1;
  // Cap sanity: 0–50 BRL
  return Math.min(50, Math.max(0, round2(n)));
}

/** Ensure row exists and return current balance (for update). */
async function lockBalance(
  client: pg.PoolClient,
  userId: string
): Promise<number> {
  await client.query(
    `INSERT INTO store_credits (user_id, balance) VALUES ($1, 0)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
  const result = await client.query(
    `SELECT balance FROM store_credits WHERE user_id = $1 FOR UPDATE`,
    [userId]
  );
  return parseFloat(result.rows[0].balance);
}

export async function creditUser(
  userId: string,
  amount: number,
  reason: CreditReason,
  opts: { orderId?: string; reviewId?: string; note?: string; client?: pg.PoolClient } = {}
): Promise<number> {
  const amt = round2(amount);
  if (amt <= 0) throw new AppError(400, 'Valor de crédito inválido.', 'INVALID_CREDIT');

  const ownClient = !opts.client;
  const client = opts.client ?? (await getClient());
  try {
    if (ownClient) await client.query('BEGIN');
    const bal = await lockBalance(client, userId);
    const next = round2(bal + amt);
    await client.query(
      `UPDATE store_credits SET balance = $1, updated_at = NOW() WHERE user_id = $2`,
      [next, userId]
    );
    await client.query(
      `INSERT INTO store_credit_ledger (user_id, amount, reason, order_id, review_id, note)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, amt, reason, opts.orderId ?? null, opts.reviewId ?? null, opts.note ?? null]
    );
    if (ownClient) await client.query('COMMIT');
    return next;
  } catch (err) {
    if (ownClient) await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    if (ownClient) client.release();
  }
}

/**
 * Debit store credit for an order. amount is positive (how much to spend).
 * Returns the amount actually applied (may be less if balance is lower).
 */
export async function redeemForOrder(
  client: pg.PoolClient,
  userId: string,
  requested: number,
  orderId: string
): Promise<number> {
  const want = round2(requested);
  if (want <= 0) return 0;

  const bal = await lockBalance(client, userId);
  const applied = round2(Math.min(bal, want));
  if (applied <= 0) return 0;

  const next = round2(bal - applied);
  await client.query(
    `UPDATE store_credits SET balance = $1, updated_at = NOW() WHERE user_id = $2`,
    [next, userId]
  );
  await client.query(
    `INSERT INTO store_credit_ledger (user_id, amount, reason, order_id, note)
     VALUES ($1, $2, 'order_redeem', $3, $4)`,
    [userId, -applied, orderId, `Resgate no pedido`]
  );
  return applied;
}

/** Whether this order already granted a review_reward (1× per order). */
export async function hasReviewRewardForOrder(orderId: string): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM store_credit_ledger
     WHERE order_id = $1 AND reason = 'review_reward' LIMIT 1`,
    [orderId]
  );
  return result.rows.length > 0;
}
