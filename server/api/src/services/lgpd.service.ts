import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { query, getClient } from '../config/database.js';
import { AppError } from '../middleware/error-handler.js';
import { auditLog } from '../utils/audit.js';

const BCRYPT_ROUNDS = 12;

/**
 * Export all user data for LGPD compliance (Art. 18).
 * Excludes sensitive fields: password_hash, refresh_token_hash.
 * Includes shop orders, reviews, store credit (010+) and wholesale account (012).
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

  // Perguntas e notificações (migration 017) — tabelas podem não existir em DB antigo
  let questions: Record<string, unknown>[] = [];
  let notifications: Record<string, unknown>[] = [];
  try {
    const questionsResult = await query(
      `SELECT q.id, q.body, q.status, q.answer_body, q.answered_at, q.created_at,
              p.name AS product_name
       FROM product_questions q
       LEFT JOIN products p ON p.id = q.product_id
       WHERE q.user_id = $1 ORDER BY q.created_at DESC`,
      [userId]
    );
    questions = questionsResult.rows;

    const notificationsResult = await query(
      `SELECT id, kind, title, body, link, read_at, created_at
       FROM notifications WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    notifications = notificationsResult.rows;
  } catch {
    // migration 017 not applied yet
  }

  const storeCreditResult = await query(
    `SELECT user_id, balance, updated_at FROM store_credits WHERE user_id = $1`,
    [userId]
  );

  const storeCreditLedgerResult = await query(
    `SELECT id, amount, reason, order_id, review_id, note, created_at
     FROM store_credit_ledger WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );

  // Wholesale B2B account (CNPJ / company PII) — table may not exist on pre-012 DBs
  let wholesaleAccount: Record<string, unknown> | null = null;
  try {
    const wholesaleResult = await query(
      `SELECT id, cnpj, company_name, trade_name, state_registration, phone,
              contact_name, business_activity, status, rejection_reason,
              reviewed_at, created_at, updated_at
       FROM wholesale_accounts WHERE user_id = $1`,
      [userId]
    );
    wholesaleAccount = wholesaleResult.rows[0] || null;
  } catch {
    // migration 012 not applied yet
  }

  // Customer profile + saved products (020) — the profile holds birth date,
  // gender and address for accounts that never subscribed, so it is exactly the
  // kind of PII an access request is about. Table may not exist on pre-020 DBs.
  let customerProfile: Record<string, unknown> | null = null;
  let savedProducts: Record<string, unknown>[] = [];
  try {
    const profileResult = await query(
      `SELECT user_id, full_name, phone, birth_date, gender, photo_url, address,
              marketing_consent, created_at, updated_at
       FROM customer_profiles WHERE user_id = $1`,
      [userId]
    );
    customerProfile = profileResult.rows[0] || null;

    const savedResult = await query(
      `SELECT s.product_id, p.name AS product_name, s.created_at
       FROM saved_products s
       LEFT JOIN products p ON p.id = s.product_id
       WHERE s.user_id = $1 ORDER BY s.created_at DESC`,
      [userId]
    );
    savedProducts = savedResult.rows;
  } catch {
    // migration 020 not applied yet
  }

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
    productQuestions: questions,
    notifications,
    wholesaleAccount,
    customerProfile,
    savedProducts,
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

    // Customer profile (020): pure PII with no accounting value — unlike orders,
    // there is nothing worth keeping, so it goes entirely. The users row is only
    // anonymized (never deleted), so ON DELETE CASCADE never fires here and both
    // tables need an explicit delete.
    //
    // Guarded by to_regclass because ensureSchema runs after listen() and is not
    // awaited: on a pre-020 database the table may still be missing, and a plain
    // DELETE against it would abort this whole transaction, blocking the erasure
    // request entirely. to_regclass returns NULL instead of raising.
    const profileTables = await client.query(
      `SELECT to_regclass('public.customer_profiles') AS profiles,
              to_regclass('public.saved_products') AS saved`
    );
    if (profileTables.rows[0]?.profiles) {
      await client.query(`DELETE FROM customer_profiles WHERE user_id = $1`, [userId]);
    }
    if (profileTables.rows[0]?.saved) {
      await client.query(`DELETE FROM saved_products WHERE user_id = $1`, [userId]);
    }

    // Anonymize shop orders (keep financial rows for accounting, strip PII)
    await client.query(
      `UPDATE orders SET
         customer_name = 'REDACTED',
         customer_email = 'redacted@redacted',
         customer_phone = NULL,
         shipping_address = '{"redacted":true}'::jsonb,
         tracking_code = NULL,
         tracking_url = NULL,
         customer_cnpj = NULL
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

    // Redact questions (texto some da vitrine; a resposta pública some junto,
    // porque ela cita a pergunta) e apaga as notificações — não têm valor de auditoria.
    //
    // to_regclass em vez de try/catch: um statement que falha aborta a transação
    // inteira no Postgres, então o catch salvaria o erro mas quebraria o resto
    // da exclusão. Aqui a tabela ausente (migration 017 não aplicada) só pula.
    const has017 = await client.query(
      `SELECT to_regclass('public.product_questions') IS NOT NULL AS questions,
              to_regclass('public.notifications') IS NOT NULL AS notifications`
    );
    if (has017.rows[0]?.questions) {
      await client.query(
        `UPDATE product_questions SET
           body = 'REDACTED',
           answer_body = NULL,
           status = 'hidden'
         WHERE user_id = $1`,
        [userId]
      );
    }
    if (has017.rows[0]?.notifications) {
      await client.query(`DELETE FROM notifications WHERE user_id = $1`, [userId]);
    }

    // Zero store credit (ledger retained for audit, amounts kept)
    await client.query(
      `UPDATE store_credits SET balance = 0, updated_at = NOW() WHERE user_id = $1`,
      [userId]
    );

    // Disable + redact wholesale account (CNPJ / company PII).
    // CNPJ becomes a unique placeholder derived from account id (keeps UNIQUE, no real PII).
    try {
      await client.query(
        `UPDATE wholesale_accounts SET
           company_name = 'REDACTED',
           trade_name = NULL,
           state_registration = NULL,
           phone = NULL,
           contact_name = 'REDACTED',
           business_activity = NULL,
           status = 'disabled',
           rejection_reason = NULL,
           admin_notes = NULL,
           cnpj = lpad(right(replace(id::text, '-', ''), 14), 14, '0')
         WHERE user_id = $1`,
        [userId]
      );
    } catch {
      // table may not exist pre-012
    }

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
          wholesaleRedacted: true,
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
