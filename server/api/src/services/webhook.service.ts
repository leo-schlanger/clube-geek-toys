import pg from 'pg';
import { query, getClient } from '../config/database.js';
import { AppError } from '../middleware/error-handler.js';
import { sendTemplateEmail } from './email.service.js';
import { mapPagBankStatus } from '../utils/pagbank.js';
import type { PagBankCharge, PagBankOrder } from '../utils/pagbank.js';

interface WebhookInput {
  body: PagBankOrder;
  requestId: string;
}

/**
 * PagBank webhook processor.
 * PagBank sends the full order/charge data in the webhook body
 * (same format as the synchronous API response).
 */
export async function processWebhook(input: WebhookInput) {
  const { body, requestId } = input;

  const orderId = body.id;
  const charges = body.charges || [];
  const qrCodes = body.qr_codes || [];
  const referenceId = body.reference_id;

  if (!orderId) {
    throw new AppError(400, 'Webhook inválido: sem order ID');
  }

  // Idempotency check — key uses chargeId/qrCodeId (not status) to prevent replays
  const entityId = charges[0]?.id || qrCodes[0]?.id || 'unknown';
  const webhookKey = `pagbank_${orderId}_${entityId}`;
  const existing = await query(
    'SELECT webhook_key FROM processed_webhooks WHERE webhook_key = $1',
    [webhookKey]
  );
  if (existing.rows.length > 0) {
    console.log(`[WEBHOOK] Already processed: ${webhookKey}`);
    return;
  }

  // Determine if this is a charge (card) or QR code (PIX) payment
  if (charges.length > 0) {
    await processChargeNotification(orderId, charges[0], referenceId || '');
  } else if (qrCodes.length > 0) {
    await processPixNotification(orderId, qrCodes[0], referenceId || '');
  }

  // Mark as processed AFTER successful processing
  await query(
    `INSERT INTO processed_webhooks (webhook_key, type, action, data_id, request_id)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
    [webhookKey, 'pagbank_order', charges[0]?.status || 'notification', orderId, requestId || '']
  );
}

async function processChargeNotification(orderId: string, charge: PagBankCharge, referenceId: string) {
  const status = mapPagBankStatus(charge.status);
  const amountInReais = (charge.amount?.value || 0) / 100;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Update payment record
    await client.query(
      `UPDATE payments SET status = $1, provider_status = $2, paid_at = $3, webhook_processed_at = NOW()
       WHERE provider_id = $4`,
      [status, charge.status, charge.paid_at || null, orderId]
    );

    // If paid, check if this is a subscription payment or one-time
    if (status === 'paid' && referenceId) {
      // Check if it's a subscription charge
      const subResult = await client.query(
        'SELECT id FROM subscriptions WHERE provider_id = $1',
        [orderId]
      );

      if (subResult.rows.length > 0) {
        // Subscription payment
        const subscriptionId = subResult.rows[0].id;
        await processSubscriptionPayment(client, subscriptionId, charge, orderId);
      } else {
        // One-time payment — activate member
        await activateMember(client, referenceId, orderId, amountInReais);
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function processPixNotification(orderId: string, qrCode: NonNullable<PagBankOrder['qr_codes']>[number], referenceId: string) {
  // PIX QR code was paid
  if (qrCode.status !== 'PAID') return;

  const amountInReais = (qrCode.amount?.value || 0) / 100;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE payments SET status = 'paid', provider_status = 'PAID', paid_at = NOW(), webhook_processed_at = NOW()
       WHERE provider_id = $1`,
      [orderId]
    );

    if (referenceId) {
      await activateMember(client, referenceId, orderId, amountInReais);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function activateMember(client: pg.PoolClient, memberId: string, paymentRef: string, amount: number) {
  const now = new Date();
  const expiryDate = new Date(now);
  expiryDate.setMonth(expiryDate.getMonth() + 1);

  await client.query(
    `UPDATE members SET status = 'active', start_date = $1, expiry_date = $2,
     activated_at = NOW(), activated_by_payment = $3, pending_payment = NULL
     WHERE (id = $4 OR user_id::text = $4) AND status != 'active'`,
    [now.toISOString().split('T')[0], expiryDate.toISOString().split('T')[0], paymentRef, memberId]
  );

  // Send confirmation email
  const memberResult = await client.query(
    'SELECT email, full_name, plan FROM members WHERE id = $1 OR user_id::text = $1',
    [memberId]
  );
  if (memberResult.rows.length > 0) {
    const member = memberResult.rows[0];
    sendTemplateEmail({
      template: 'payment-confirmed',
      to: member.email,
      variables: {
        name: member.full_name,
        amount: String(amount),
        plan: member.plan,
      },
    }).catch((err) => console.error('[WEBHOOK] Email error:', err));
  }
}

async function processSubscriptionPayment(client: pg.PoolClient, subscriptionId: string, charge: PagBankCharge, orderId: string) {
  const status = charge.status;
  const amountInReais = (charge.amount?.value || 0) / 100;

  // Save subscription payment record
  await client.query(
    `INSERT INTO subscription_payments (id, subscription_id, member_id, amount, status, provider_payment_id)
     SELECT $1, $2, member_id, $3, $4, $5
     FROM subscriptions WHERE id = $2
     ON CONFLICT (id) DO UPDATE SET status = $4`,
    [
      `sp_${orderId}`,
      subscriptionId,
      amountInReais,
      status,
      charge.id || orderId,
    ]
  );

  if (status === 'PAID') {
    await client.query(
      `UPDATE subscriptions SET failed_payments = 0, last_payment_date = NOW() WHERE id = $1`,
      [subscriptionId]
    );
    await client.query(
      `UPDATE members SET expiry_date = expiry_date + INTERVAL '1 month', status = 'active'
       WHERE subscription_id = $1`,
      [subscriptionId]
    );
  } else if (status === 'DECLINED') {
    const result = await client.query(
      `UPDATE subscriptions SET failed_payments = failed_payments + 1 WHERE id = $1 RETURNING failed_payments`,
      [subscriptionId]
    );

    if (result.rows[0]?.failed_payments >= 3) {
      await client.query(
        `UPDATE subscriptions SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`,
        [subscriptionId]
      );
      await client.query(
        `UPDATE members SET subscription_status = 'cancelled', auto_renewal = FALSE WHERE subscription_id = $1`,
        [subscriptionId]
      );
    }
  }
}
