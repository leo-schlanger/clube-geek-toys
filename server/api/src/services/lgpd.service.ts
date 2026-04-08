import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { query, getClient } from '../config/database.js';
import { AppError } from '../middleware/error-handler.js';

const BCRYPT_ROUNDS = 12;

/**
 * Export all user data for LGPD compliance.
 * Excludes sensitive fields: password_hash, refresh_token_hash.
 */
export async function exportUserData(userId: string) {
  // User info (exclude sensitive fields)
  const userResult = await query(
    `SELECT id, email, role, email_verified, email_verified_at, created_at, updated_at
     FROM users WHERE id = $1`,
    [userId]
  );

  if (userResult.rows.length === 0) {
    throw new AppError(404, 'Usuário não encontrado');
  }

  const user = userResult.rows[0];

  // Member info
  const memberResult = await query(
    `SELECT * FROM members WHERE user_id = $1`,
    [userId]
  );

  const memberId = memberResult.rows[0]?.id || null;

  // Contracts
  const contractsResult = memberId
    ? await query(`SELECT * FROM contracts WHERE member_id = $1 ORDER BY created_at DESC`, [memberId])
    : { rows: [] };

  // Payments
  const paymentsResult = memberId
    ? await query(`SELECT * FROM payments WHERE member_id = $1 ORDER BY created_at DESC`, [memberId])
    : { rows: [] };

  // Point transactions
  const pointsResult = memberId
    ? await query(`SELECT * FROM point_transactions WHERE member_id = $1 ORDER BY created_at DESC`, [memberId])
    : { rows: [] };

  // Subscriptions
  const subscriptionsResult = memberId
    ? await query(`SELECT * FROM subscriptions WHERE member_id = $1 ORDER BY created_at DESC`, [memberId])
    : { rows: [] };

  // Audit logs
  const auditResult = await query(
    `SELECT * FROM audit_logs WHERE user_id = $1 OR member_id = $2 ORDER BY created_at DESC`,
    [userId, memberId]
  );

  // Email logs
  const emailResult = await query(
    `SELECT * FROM email_logs WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );

  return {
    exportedAt: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.email_verified,
      emailVerifiedAt: user.email_verified_at,
      googleId: user.google_id,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    },
    member: memberResult.rows[0] || null,
    contracts: contractsResult.rows,
    payments: paymentsResult.rows,
    pointTransactions: pointsResult.rows,
    subscriptions: subscriptionsResult.rows,
    auditLogs: auditResult.rows,
    emailLogs: emailResult.rows,
  };
}

/**
 * Delete/anonymize user account for LGPD compliance.
 * Requires password confirmation before proceeding.
 */
export async function deleteUserAccount(userId: string, password: string) {
  // Verify password
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

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Get member ID
    const memberResult = await client.query(
      `SELECT id FROM members WHERE user_id = $1`,
      [userId]
    );
    const memberId = memberResult.rows[0]?.id || null;

    // Anonymize user data
    const randomHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), BCRYPT_ROUNDS);
    await client.query(
      `UPDATE users SET
        email = $1,
        password_hash = $2,
        role = 'disabled',
        refresh_token_hash = NULL,
        google_id = NULL
       WHERE id = $3`,
      [`deleted_${userId}@redacted`, randomHash, userId]
    );

    // Anonymize member data
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

      // Anonymize contract personal data
      await client.query(
        `UPDATE contracts SET
          member_name = 'REDACTED',
          member_cpf = '00000000000',
          member_email = 'redacted',
          signature_preview = NULL
         WHERE member_id = $1`,
        [memberId]
      );

      // Cancel active subscriptions
      await client.query(
        `UPDATE subscriptions SET status = 'cancelled' WHERE member_id = $1 AND status = 'active'`,
        [memberId]
      );
    }

    // Audit log (NOT deleted — legal retention)
    await client.query(
      `INSERT INTO audit_logs (action, user_id, member_id, details)
       VALUES ('lgpd_data_deleted', $1, $2, $3)`,
      [userId, memberId, JSON.stringify({ originalEmail: user.email, deletedAt: new Date().toISOString() })]
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
