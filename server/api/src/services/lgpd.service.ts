import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { query, getClient } from '../config/database.js';
import { AppError } from '../middleware/error-handler.js';
import { auditLog } from '../utils/audit.js';

const BCRYPT_ROUNDS = 12;

/**
 * Export all user data for LGPD compliance (Art. 18).
 * Excludes sensitive fields: password_hash, refresh_token_hash.
 * Includes shop orders, reviews and store credit (migration 010+).
 */
export async function exportUserData(userId: string) {
  const userResult = await query(
    `SELECT id, email, role, email_verified, email_verified_at, created_at, updated_at
     FROM users WHERE id = $1`,
    [userId]
  );

  if (userResult.rows.length === 0) {
    throw new AppError(404, 'Usuário não encontrado');
  }

  const user = userResult.rows[0];
  const memberResult = await query(`SELECT * FROM members WHERE user_id = $1`, [userId]);
  const memberId = (memberResult.rows[0]?.id as string | undefined) || null;
  const userEmail = user.email as string;

  const contractsResult = memberId
    ? await query(`SELECT * FROM contracts WHERE member_id = $1 ORDER BY created_at DESC`, [memberId])
    : { rows: [] };

  const paymentsResult = memberId
    ? await query(`SELECT * FROM payments WHERE member_id = $1 ORDER BY created_at DESC`, [memberId])
    : { rows: [] };

  const subscriptionsResult = memberId
    ? await query(`SELECT * FROM subscriptions WHERE member_id = $1 ORDER BY created_at DESC`, [memberId])
    : { rows: [] };

  // Shop orders: by user_id, member_id, or customer_email (guest checkouts with same email)
  const ordersResult = await query(
    `SELECT * FROM orders
     WHERE user_id = $1
        OR ($2::uuid IS NOT NULL AND member_id = $2)
        OR lower(customer_email) = lower($3)
     ORDER BY created_at DESC`,
    [userId, memberId, userEmail]
  );

  const orderIds = ordersResult.rows.map((r) => r.id as string);
  const orderItemsResult =
    orderIds.length > 0
      ? await query(
          `SELECT * FROM order_items WHERE order_id = ANY($1::uuid[]) ORDER BY order_id, id`,
          [orderIds]
        )
      : { rows: [] };

  const reviewsResult = await query(
    `SELECT * FROM product_reviews WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );

  const storeCreditResult = await query(
    `SELECT user_id, balance, updated_at FROM store_credits WHERE user_id = $1`,
    [userId]
  );

  const storeCreditLedgerResult = await query(
    `SELECT id, amount, reason, order_id, review_id, note, created_at
     FROM store_credit_ledger WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );

  const auditResult = await query(
    `SELECT * FROM audit_logs
     WHERE user_id = $1 OR ($2::uuid IS NOT NULL AND member_id = $2)
     ORDER BY timestamp DESC`,
    [userId, memberId]
  );

  // email_logs has member_id (not user_id) + recipient address
  const emailResult = memberId
    ? await query(
        `SELECT * FROM email_logs
         WHERE member_id = $1 OR lower(recipient) = lower($2)
         ORDER BY sent_at DESC`,
        [memberId, userEmail]
      )
    : await query(
        `SELECT * FROM email_logs WHERE lower(recipient) = lower($1) ORDER BY sent_at DESC`,
        [userEmail]
      );

  await auditLog('lgpd.export', userId, { memberId }, memberId);

  return {
    exportedAt: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.email_verified,
      emailVerifiedAt: user.email_verified_at,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    },
    member: memberResult.rows[0] || null,
    contracts: contractsResult.rows,
    payments: paymentsResult.rows,
    subscriptions: subscriptionsResult.rows,
    shopOrders: ordersResult.rows,
    shopOrderItems: orderItemsResult.rows,
    productReviews: reviewsResult.rows,
    storeCredit: storeCreditResult.rows[0] || { balance: 0 },
    storeCreditLedger: storeCreditLedgerResult.rows,
    auditLogs: auditResult.rows,
    emailLogs: emailResult.rows,
  };
}

/**
 * Delete/anonymize user account for LGPD compliance.
 * Requires password confirmation. Shop PII (orders address, reviews text) is redacted.
 */
export async function deleteUserAccount(userId: string, password: string) {
  const userResult = await query(
    `SELECT id, email, password_hash FROM users WHERE id = $1`,
    [userId]
  );

  if (userResult.rows.length === 0) {
    throw new AppError(404, 'Usuário não encontrado');
  }

  const user = userResult.rows[0];

  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    throw new AppError(401, 'Senha incorreta');
  }

  const activeSub = await query(
    `SELECT s.id FROM subscriptions s JOIN members m ON m.id = s.member_id
     WHERE m.user_id = $1 AND s.status IN ('authorized', 'pending')`,
    [userId]
  );
  if (activeSub.rows.length > 0) {
    throw new AppError(400, 'Cancele sua assinatura ativa antes de excluir sua conta');
  }

  // Block if open shop orders still shipping
  const openOrders = await query(
    `SELECT id FROM orders
     WHERE (user_id = $1 OR customer_email = $2)
       AND status IN ('pending', 'paid', 'processing', 'shipped')
     LIMIT 1`,
    [userId, user.email]
  );
  if (openOrders.rows.length > 0) {
    throw new AppError(
      400,
      'Conclua ou cancele pedidos em andamento na loja antes de excluir a conta'
    );
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const memberResult = await client.query(`SELECT id FROM members WHERE user_id = $1`, [userId]);
    const memberId = (memberResult.rows[0]?.id as string | undefined) || null;
    const originalEmail = user.email as string;

    const randomHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), BCRYPT_ROUNDS);
    await client.query(
      `UPDATE users SET
        email = $1,
        password_hash = $2,
        role = 'disabled',
        refresh_token_hash = NULL,
        prev_refresh_token_hash = NULL
       WHERE id = $3`,
      [`deleted_${userId}@redacted`, randomHash, userId]
    );

    if (memberId) {
      await client.query(
        `UPDATE members SET
          full_name = 'REDACTED',
          cpf = '00000000000',
          email = 'redacted',
          phone = NULL,
          photo_url = NULL,
          status = 'inactive'
         WHERE id = $1`,
        [memberId]
      );

      await client.query(
        `UPDATE contracts SET
          member_name = 'REDACTED',
          member_cpf = '00000000000',
          member_email = 'redacted',
          signature_preview = NULL
         WHERE member_id = $1`,
        [memberId]
      );

      await client.query(
        `UPDATE subscriptions SET status = 'cancelled'
         WHERE member_id = $1 AND status IN ('authorized', 'pending', 'paused')`,
        [memberId]
      );
    }

    // Anonymize shop orders (keep financial rows for accounting, strip PII)
    await client.query(
      `UPDATE orders SET
         customer_name = 'REDACTED',
         customer_email = 'redacted@redacted',
         customer_phone = NULL,
         shipping_address = '{"redacted":true}'::jsonb,
         tracking_code = NULL,
         tracking_url = NULL
       WHERE user_id = $1
          OR ($2::uuid IS NOT NULL AND member_id = $2)
          OR lower(customer_email) = lower($3)`,
      [userId, memberId, originalEmail]
    );

    // Redact reviews (keep rating for aggregate integrity; hide text)
    await client.query(
      `UPDATE product_reviews SET
         title = NULL,
         body = NULL,
         status = 'hidden'
       WHERE user_id = $1`,
      [userId]
    );

    // Zero store credit (ledger retained for audit, amounts kept)
    await client.query(
      `UPDATE store_credits SET balance = 0, updated_at = NOW() WHERE user_id = $1`,
      [userId]
    );

    // Redact email log recipients tied to this person
    if (memberId) {
      await client.query(
        `UPDATE email_logs SET recipient = 'redacted@redacted' WHERE member_id = $1`,
        [memberId]
      );
    }
    await client.query(
      `UPDATE email_logs SET recipient = 'redacted@redacted'
       WHERE lower(recipient) = lower($1)`,
      [originalEmail]
    );

    await client.query(
      `INSERT INTO audit_logs (action, user_id, member_id, details)
       VALUES ('lgpd_data_deleted', $1, $2, $3)`,
      [
        userId,
        memberId,
        JSON.stringify({
          originalEmail,
          deletedAt: new Date().toISOString(),
          shopOrdersAnonymized: true,
          reviewsHidden: true,
          storeCreditZeroed: true,
        }),
      ]
    );

    await client.query('COMMIT');

    return { message: 'Conta excluída e dados anonimizados com sucesso' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
