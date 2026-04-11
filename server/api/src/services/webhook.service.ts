import pg from 'pg';
import { getClient } from '../config/database.js';
import { AppError } from '../middleware/error-handler.js';
import { sendTemplateEmail } from './email.service.js';
import { mapPagBankStatus } from '../utils/pagbank.js';
import { auditLog } from '../utils/audit.js';
import type { PagBankCharge, PagBankOrder } from '../utils/pagbank.js';

interface WebhookInput {
  body: PagBankOrder;
  requestId: string;
}

/**
 * Email job collected during transaction processing — sent AFTER commit.
 * This avoids: (a) prolonging DB locks, (b) silently swallowed errors inside transactions,
 * (c) emails being sent for work that gets rolled back.
 */
interface PendingEmail {
  template: string;
  to: string;
  variables: Record<string, string>;
  member_id?: string;
}

/**
 * PagBank webhook processor.
 * PagBank sends the full order/charge data in the webhook body
 * (same format as the synchronous API response).
 *
 * Idempotency strategy: claim the webhook key via INSERT ... ON CONFLICT in the SAME transaction
 * as the side effects. If processing fails, ROLLBACK undoes both the claim and the side effects,
 * so a retry can re-process. If it succeeds, the claim prevents duplicate processing of the same
 * webhook event (replays, retries, multiple delivery).
 */
export async function processWebhook(input: WebhookInput): Promise<void> {
  const { body, requestId } = input;

  const orderId = body.id;
  const charges = body.charges || [];
  const qrCodes = body.qr_codes || [];
  const referenceId = body.reference_id;

  if (!orderId) {
    throw new AppError(400, 'Webhook inválido: sem order ID', 'WEBHOOK_MISSING_ORDER_ID');
  }

  // Idempotency key — uses chargeId/qrCodeId so a status update for the same charge is keyed once.
  const entityId = charges[0]?.id || qrCodes[0]?.id || 'unknown';
  const status = charges[0]?.status || qrCodes[0]?.status || 'notification';
  const webhookKey = `pagbank_${orderId}_${entityId}_${status}`;

  const pendingEmails: PendingEmail[] = [];

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Atomic claim — if INSERT inserts 0 rows, this webhook was already processed; bail.
    const claim = await client.query(
      `INSERT INTO processed_webhooks (webhook_key, type, action, data_id, request_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (webhook_key) DO NOTHING
       RETURNING webhook_key`,
      [webhookKey, 'pagbank_order', status, orderId, requestId || '']
    );
    if (claim.rowCount === 0) {
      console.log(`[WEBHOOK] Already processed: ${webhookKey}`);
      await client.query('ROLLBACK');
      return;
    }

    // Process — collect emails to send AFTER commit
    if (charges.length > 0) {
      await processChargeNotification(client, orderId, charges[0], referenceId || '', pendingEmails);
    } else if (qrCodes.length > 0) {
      await processPixNotification(client, orderId, qrCodes[0], referenceId || '', pendingEmails);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Side effects (emails) AFTER commit so they reflect persisted state.
  // Each one is independent — failure of one doesn't block others.
  for (const job of pendingEmails) {
    try {
      await sendTemplateEmail(job);
    } catch (err) {
      console.error(`[WEBHOOK] Email send failed (template=${job.template}, to=${job.to}):`, err);
    }
  }
}

async function processChargeNotification(
  client: pg.PoolClient,
  orderId: string,
  charge: PagBankCharge,
  referenceId: string,
  pendingEmails: PendingEmail[],
): Promise<void> {
  const status = mapPagBankStatus(charge.status);
  const amountInReais = (charge.amount?.value || 0) / 100;

  // Update payment record
  await client.query(
    `UPDATE payments SET status = $1, provider_status = $2, paid_at = $3, webhook_processed_at = NOW()
     WHERE provider_id = $4`,
    [status, charge.status, charge.paid_at || null, orderId]
  );

  // If failed, notify member
  if (status === 'failed' && referenceId) {
    const memberResult = await client.query(
      'SELECT id, email, full_name FROM members WHERE id = $1',
      [referenceId]
    );
    if (memberResult.rows.length > 0) {
      const m = memberResult.rows[0];
      pendingEmails.push({
        template: 'payment-failed',
        to: m.email,
        variables: { name: m.full_name },
        member_id: m.id,
      });
    }
    await auditLog('payment.failed', null, { orderId, chargeId: charge.id, amount: amountInReais, providerStatus: charge.status }, referenceId);
  }

  // If paid, check if this is a subscription payment or one-time
  if (status === 'paid' && referenceId) {
    const subResult = await client.query(
      'SELECT id FROM subscriptions WHERE provider_id = $1',
      [orderId]
    );

    if (subResult.rows.length > 0) {
      // Subscription recurring payment
      const subscriptionId = subResult.rows[0].id;
      await processSubscriptionPayment(client, subscriptionId, charge, orderId, pendingEmails);
    } else {
      // One-time payment — activate member
      await activateMember(client, referenceId, orderId, amountInReais, pendingEmails);
    }

    await auditLog('payment.received', null, { orderId, chargeId: charge.id, amount: amountInReais }, referenceId);
  }

  if (status === 'refunded' && referenceId) {
    await auditLog('payment.refunded', null, { orderId, chargeId: charge.id, amount: amountInReais }, referenceId);
  }
}

async function processPixNotification(
  client: pg.PoolClient,
  orderId: string,
  qrCode: NonNullable<PagBankOrder['qr_codes']>[number],
  referenceId: string,
  pendingEmails: PendingEmail[],
): Promise<void> {
  // PIX QR code was paid
  if (qrCode.status !== 'PAID') return;

  const amountInReais = (qrCode.amount?.value || 0) / 100;

  await client.query(
    `UPDATE payments SET status = 'paid', provider_status = 'PAID', paid_at = NOW(), webhook_processed_at = NOW()
     WHERE provider_id = $1`,
    [orderId]
  );

  if (referenceId) {
    await activateMember(client, referenceId, orderId, amountInReais, pendingEmails);
    await auditLog('payment.received', null, { orderId, method: 'pix', amount: amountInReais }, referenceId);
  }
}

async function activateMember(
  client: pg.PoolClient,
  memberId: string,
  paymentRef: string,
  amount: number,
  pendingEmails: PendingEmail[],
): Promise<void> {
  // Snapshot member for audit
  const memberLookup = await client.query(
    'SELECT id, payment_type, status FROM members WHERE id = $1 FOR UPDATE',
    [memberId]
  );
  if (memberLookup.rows.length === 0) return;

  const member = memberLookup.rows[0];
  const beforeStatus = member.status;
  const now = new Date();
  const expiryDate = new Date(now);

  // Calendar-correct expiry: setMonth/setFullYear preserves day-of-month.
  if (member.payment_type === 'annual') {
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
  } else {
    expiryDate.setMonth(expiryDate.getMonth() + 1);
  }

  await client.query(
    `UPDATE members SET status = 'active', start_date = $1, expiry_date = $2,
     activated_at = NOW(), activated_by_payment = $3, pending_payment = NULL
     WHERE id = $4 AND status != 'active'`,
    [now.toISOString().split('T')[0], expiryDate.toISOString().split('T')[0], paymentRef, member.id]
  );

  await auditLog(
    'member.activated',
    null,
    { paymentRef, amount, before: { status: beforeStatus }, after: { status: 'active', expiryDate: expiryDate.toISOString().split('T')[0] } },
    member.id,
  );

  // Queue confirmation email — sent after COMMIT
  const memberResult = await client.query(
    'SELECT id, email, full_name, plan FROM members WHERE id = $1',
    [member.id]
  );
  if (memberResult.rows.length > 0) {
    const m = memberResult.rows[0];
    pendingEmails.push({
      template: 'payment-confirmed',
      to: m.email,
      variables: {
        name: m.full_name,
        amount: amount.toFixed(2).replace('.', ','),
        plan: m.plan,
        expiry_date: expiryDate.toLocaleDateString('pt-BR'),
      },
      member_id: m.id,
    });
  }
}

async function processSubscriptionPayment(
  client: pg.PoolClient,
  subscriptionId: string,
  charge: PagBankCharge,
  orderId: string,
  pendingEmails: PendingEmail[],
): Promise<void> {
  const status = charge.status;
  const amountInReais = (charge.amount?.value || 0) / 100;

  // Save subscription payment record
  await client.query(
    `INSERT INTO subscription_payments (id, subscription_id, member_id, amount, status, provider_payment_id)
     SELECT $1, $2, member_id, $3, $4, $5
     FROM subscriptions WHERE id = $2
     ON CONFLICT (id) DO UPDATE SET status = $4`,
    [`sp_${orderId}`, subscriptionId, amountInReais, status, charge.id || orderId]
  );

  // Get member + subscription info for expiry calculation and email
  const memberResult = await client.query(
    `SELECT m.id, m.email, m.full_name, s.plan, s.frequency_type, s.transaction_amount, s.next_payment_date
     FROM members m JOIN subscriptions s ON s.id = $1 WHERE m.subscription_id = $1`,
    [subscriptionId]
  );
  const member = memberResult.rows[0];
  // interval string passed as a parameter ($::interval) — never interpolated.
  const interval = member?.frequency_type === 'years' ? '1 year' : '1 month';

  if (status === 'PAID') {
    await client.query(
      `UPDATE subscriptions SET failed_payments = 0, last_payment_date = NOW() WHERE id = $1`,
      [subscriptionId]
    );
    // Parametrized interval addition — no string interpolation.
    await client.query(
      `UPDATE members SET expiry_date = expiry_date + $2::interval, status = 'active'
       WHERE subscription_id = $1`,
      [subscriptionId, interval]
    );

    if (member) {
      pendingEmails.push({
        template: 'subscription-payment',
        to: member.email,
        variables: {
          name: member.full_name,
          amount: amountInReais.toFixed(2).replace('.', ','),
          plan: member.plan,
          next_payment: member.next_payment_date
            ? new Date(member.next_payment_date).toLocaleDateString('pt-BR')
            : '—',
        },
        member_id: member.id,
      });
      await auditLog('subscription.charge.succeeded', null, { subscriptionId, amount: amountInReais, chargeId: charge.id }, member.id);
    }
  } else if (status === 'DECLINED') {
    const result = await client.query(
      `UPDATE subscriptions SET failed_payments = failed_payments + 1 WHERE id = $1 RETURNING failed_payments`,
      [subscriptionId]
    );

    const failedCount = result.rows[0]?.failed_payments || 0;

    if (member) {
      pendingEmails.push({
        template: 'subscription-payment-failed',
        to: member.email,
        variables: {
          name: member.full_name,
          amount: (member.transaction_amount || amountInReais).toFixed(2).replace('.', ','),
          failed_count: String(failedCount),
        },
        member_id: member.id,
      });
      await auditLog('subscription.charge.failed', null, { subscriptionId, failedCount, amount: amountInReais }, member.id);
    }

    if (failedCount >= 3) {
      await client.query(
        `UPDATE subscriptions SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`,
        [subscriptionId]
      );
      await client.query(
        `UPDATE members SET subscription_status = 'cancelled', auto_renewal = FALSE WHERE subscription_id = $1`,
        [subscriptionId]
      );

      if (member) {
        pendingEmails.push({
          template: 'subscription-cancelled',
          to: member.email,
          variables: { name: member.full_name },
          member_id: member.id,
        });
        await auditLog('subscription.cancelled', null, { subscriptionId, reason: 'failed_payments_threshold', failedCount }, member.id);
      }
    }
  }
}
