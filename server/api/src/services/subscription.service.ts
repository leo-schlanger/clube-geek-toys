import { query } from '../config/database.js';
import { env } from '../config/env.js';
import { pagbankRequest } from '../utils/pagbank.js';
import type { PagBankOrder } from '../utils/pagbank.js';
import { AppError } from '../middleware/error-handler.js';
import { sendTemplateEmail } from './email.service.js';
import crypto from 'crypto';

export async function createSubscription(data: {
  member_id: string;
  plan: string;
  frequency_type: string;
  payer_email: string;
  payer_name: string;
  encrypted_card: string;
  transaction_amount: number;
}) {
  // PagBank: create first recurring charge via orders API
  const order = await pagbankRequest<PagBankOrder>({
    method: 'POST',
    path: '/orders',
    body: {
      reference_id: data.member_id,
      customer: {
        name: data.payer_name,
        email: data.payer_email,
      },
      items: [
        {
          reference_id: crypto.randomUUID(),
          name: `Clube Geek & Toys - Plano ${data.plan}`,
          quantity: 1,
          unit_amount: Math.round(data.transaction_amount * 100),
        },
      ],
      charges: [
        {
          reference_id: crypto.randomUUID(),
          description: `Assinatura Clube Geek - ${data.plan}`,
          amount: {
            value: Math.round(data.transaction_amount * 100),
            currency: 'BRL',
          },
          payment_method: {
            type: 'CREDIT_CARD',
            installments: 1,
            capture: true,
            card: {
              encrypted: data.encrypted_card,
              store: true, // Store card for recurring
            },
          },
        },
      ],
      notification_urls: [`${env.API_URL}/webhook/pagbank`],
    },
  });

  const charge = order.charges?.[0];
  const subscriptionId = `sub_${order.id}`;
  const status = charge?.status === 'PAID' ? 'authorized' : 'pending';

  // Save subscription
  await query(
    `INSERT INTO subscriptions (id, member_id, provider_id, status, plan, frequency_type, transaction_amount, payer_email, card_last_four, card_brand)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      subscriptionId,
      data.member_id,
      order.id,
      status,
      data.plan,
      data.frequency_type,
      data.transaction_amount,
      data.payer_email,
      charge?.payment_method?.card?.last_digits || null,
      charge?.payment_method?.card?.brand || null,
    ]
  );

  // Update member
  await query(
    `UPDATE members SET subscription_id = $1, subscription_status = $2, auto_renewal = TRUE WHERE id = $3`,
    [subscriptionId, status, data.member_id]
  );

  // If first charge was paid, set next payment date
  if (status === 'authorized') {
    const nextDate = data.frequency_type === 'months'
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    await query(
      `UPDATE subscriptions SET next_payment_date = $1, last_payment_date = NOW() WHERE id = $2`,
      [nextDate.toISOString(), subscriptionId]
    );
  }

  // Send confirmation email
  const memberResult = await query('SELECT full_name, email FROM members WHERE id = $1', [data.member_id]);
  if (memberResult.rows.length > 0) {
    const member = memberResult.rows[0];
    sendTemplateEmail({
      template: 'subscription-created',
      to: member.email,
      variables: {
        name: member.full_name,
        plan: data.plan,
        amount: data.transaction_amount.toFixed(2).replace('.', ','),
        card_last_four: charge?.payment_method?.card?.last_digits || '****',
      },
      member_id: data.member_id,
    }).catch((err) => console.error('[SUBSCRIPTION] Email error:', err));
  }

  return { id: subscriptionId, status };
}

export async function getSubscription(id: string) {
  const result = await query('SELECT * FROM subscriptions WHERE id = $1', [id]);
  if (result.rows.length === 0) return null;
  return mapSubscriptionRow(result.rows[0]);
}

export async function pauseSubscription(id: string) {
  const result = await query(
    `UPDATE subscriptions SET status = 'paused', paused_at = NOW() WHERE id = $1 RETURNING *`,
    [id]
  );
  if (result.rowCount === 0) throw new AppError(404, 'Assinatura não encontrada');
  await query(`UPDATE members SET subscription_status = 'paused' WHERE subscription_id = $1`, [id]);

  // Send pause notification
  const member = await query('SELECT full_name, email, id FROM members WHERE subscription_id = $1', [id]);
  if (member.rows.length > 0) {
    sendTemplateEmail({
      template: 'subscription-paused',
      to: member.rows[0].email,
      variables: { name: member.rows[0].full_name },
      member_id: member.rows[0].id,
    }).catch((err) => console.error('[SUBSCRIPTION] Email error:', err));
  }

  return mapSubscriptionRow(result.rows[0]);
}

export async function resumeSubscription(id: string) {
  const result = await query(
    `UPDATE subscriptions SET status = 'authorized', paused_at = NULL WHERE id = $1 RETURNING *`,
    [id]
  );
  if (result.rowCount === 0) throw new AppError(404, 'Assinatura não encontrada');
  await query(`UPDATE members SET subscription_status = 'authorized' WHERE subscription_id = $1`, [id]);
  return mapSubscriptionRow(result.rows[0]);
}

export async function cancelSubscription(id: string) {
  const result = await query(
    `UPDATE subscriptions SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1 RETURNING *`,
    [id]
  );
  if (result.rowCount === 0) throw new AppError(404, 'Assinatura não encontrada');
  await query(
    `UPDATE members SET subscription_status = 'cancelled', auto_renewal = FALSE WHERE subscription_id = $1`,
    [id]
  );

  // Send cancellation notification
  const member = await query('SELECT full_name, email, id FROM members WHERE subscription_id = $1', [id]);
  if (member.rows.length > 0) {
    sendTemplateEmail({
      template: 'subscription-cancelled',
      to: member.rows[0].email,
      variables: { name: member.rows[0].full_name },
      member_id: member.rows[0].id,
    }).catch((err) => console.error('[SUBSCRIPTION] Email error:', err));
  }

  return mapSubscriptionRow(result.rows[0]);
}

export async function updateCard(id: string, encryptedCard: string, payerName: string, payerEmail: string) {
  const sub = await query('SELECT * FROM subscriptions WHERE id = $1', [id]);
  if (sub.rows.length === 0) throw new AppError(404, 'Assinatura não encontrada');

  // Store the new card details for the next recurring charge
  await query(
    `UPDATE subscriptions SET card_last_four = RIGHT($2, 4), payer_email = $3 WHERE id = $1`,
    [id, encryptedCard, payerEmail]
  );

  return { message: 'Cartão atualizado com sucesso', payerName };
}

export async function getSubscriptionPayments(subscriptionId: string, limit?: number) {
  const maxRows = Math.min(limit || 20, 100);
  const result = await query(
    `SELECT * FROM subscription_payments
     WHERE subscription_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [subscriptionId, maxRows]
  );

  return result.rows.map((row) => ({
    id: row.id,
    subscriptionId: row.subscription_id,
    amount: parseFloat(row.amount),
    status: row.status,
    providerId: row.provider_id,
    providerStatus: row.provider_status,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  }));
}

function mapSubscriptionRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    memberId: row.member_id,
    providerId: row.provider_id,
    status: row.status,
    plan: row.plan,
    frequencyType: row.frequency_type,
    transactionAmount: parseFloat(row.transaction_amount as string),
    nextPaymentDate: row.next_payment_date,
    lastPaymentDate: row.last_payment_date,
    failedPayments: row.failed_payments,
    cardLastFour: row.card_last_four,
    cardBrand: row.card_brand,
    payerEmail: row.payer_email,
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at,
    pausedAt: row.paused_at,
  };
}
