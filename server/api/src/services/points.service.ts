import { query, getClient } from '../config/database.js';
import { AppError } from '../middleware/error-handler.js';
import { POINTS_MULTIPLIER, POINTS_EXPIRY_MONTHS } from '../types/index.js';
import type { PlanType } from '../types/index.js';

export async function getPointsHistory(memberId: string, limit: number) {
  const result = await query(
    `SELECT * FROM point_transactions WHERE member_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [memberId, limit]
  );
  return result.rows.map(mapPointRow);
}

export async function getExpiringPoints(memberId: string) {
  const result = await query(
    `SELECT * FROM point_transactions
     WHERE member_id = $1 AND type = 'earn' AND expired = FALSE AND expires_at IS NOT NULL
     ORDER BY expires_at ASC`,
    [memberId]
  );
  return result.rows.map(mapPointRow);
}

export async function getBalance(memberId: string) {
  const result = await query('SELECT points FROM members WHERE id = $1', [memberId]);
  if (result.rows.length === 0) throw new AppError(404, 'Membro não encontrado');
  return { points: result.rows[0].points };
}

export async function earnPoints(
  memberId: string,
  purchaseValue: number,
  isPromotion: boolean,
  createdBy: string
) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Get member plan
    const memberResult = await client.query('SELECT plan, points FROM members WHERE id = $1 FOR UPDATE', [memberId]);
    if (memberResult.rows.length === 0) throw new AppError(404, 'Membro não encontrado');

    const { plan, points: currentPoints } = memberResult.rows[0];
    const multiplier = POINTS_MULTIPLIER[plan as PlanType] || 1;
    const earnedPoints = Math.floor(purchaseValue * multiplier * (isPromotion ? 2 : 1));
    const newBalance = currentPoints + earnedPoints;

    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + POINTS_EXPIRY_MONTHS);

    // Create transaction
    const txResult = await client.query(
      `INSERT INTO point_transactions (member_id, type, points, balance, description, purchase_value, expires_at, is_promotion, created_by)
       VALUES ($1, 'earn', $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        memberId, earnedPoints, newBalance,
        `Compra R$ ${purchaseValue.toFixed(2)} (${multiplier}x${isPromotion ? ' promo' : ''})`,
        purchaseValue, expiresAt.toISOString().split('T')[0],
        isPromotion, createdBy,
      ]
    );

    // Update member points
    await client.query('UPDATE members SET points = $1 WHERE id = $2', [newBalance, memberId]);

    // Audit log
    await client.query(
      `INSERT INTO audit_logs (action, member_id, user_id, details)
       VALUES ('points_earn', $1, $2, $3)`,
      [memberId, createdBy, JSON.stringify({ points: earnedPoints, purchaseValue, isPromotion })]
    );

    await client.query('COMMIT');
    return mapPointRow(txResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function addBonusPoints(
  memberId: string,
  points: number,
  reason: string,
  createdBy: string
) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const memberResult = await client.query('SELECT points FROM members WHERE id = $1 FOR UPDATE', [memberId]);
    if (memberResult.rows.length === 0) throw new AppError(404, 'Membro não encontrado');

    const newBalance = memberResult.rows[0].points + points;

    const txResult = await client.query(
      `INSERT INTO point_transactions (member_id, type, points, balance, description, created_by)
       VALUES ($1, 'bonus', $2, $3, $4, $5) RETURNING *`,
      [memberId, points, newBalance, reason, createdBy]
    );

    await client.query('UPDATE members SET points = $1 WHERE id = $2', [newBalance, memberId]);

    await client.query(
      `INSERT INTO audit_logs (action, member_id, user_id, details)
       VALUES ('points_bonus', $1, $2, $3)`,
      [memberId, createdBy, JSON.stringify({ points, reason })]
    );

    await client.query('COMMIT');
    return mapPointRow(txResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function redeemPoints(
  memberId: string,
  points: number,
  description: string,
  createdBy: string
) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const memberResult = await client.query('SELECT points FROM members WHERE id = $1 FOR UPDATE', [memberId]);
    if (memberResult.rows.length === 0) throw new AppError(404, 'Membro não encontrado');

    const currentPoints = memberResult.rows[0].points;
    if (currentPoints < points) {
      throw new AppError(400, 'Pontos insuficientes');
    }

    const newBalance = currentPoints - points;

    const txResult = await client.query(
      `INSERT INTO point_transactions (member_id, type, points, balance, description, created_by)
       VALUES ($1, 'redeem', $2, $3, $4, $5) RETURNING *`,
      [memberId, -points, newBalance, description, createdBy]
    );

    await client.query('UPDATE members SET points = $1 WHERE id = $2', [newBalance, memberId]);

    await client.query(
      `INSERT INTO audit_logs (action, member_id, user_id, details)
       VALUES ('points_redeem', $1, $2, $3)`,
      [memberId, createdBy, JSON.stringify({ points, description })]
    );

    await client.query('COMMIT');
    return mapPointRow(txResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function mapPointRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    memberId: row.member_id,
    type: row.type,
    points: row.points,
    balance: row.balance,
    description: row.description,
    purchaseValue: row.purchase_value ? parseFloat(row.purchase_value as string) : null,
    expiresAt: row.expires_at,
    expired: row.expired,
    isPromotion: row.is_promotion,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}
