import pg from 'pg';
import Stripe from 'stripe';
import { getClient } from '../config/database.js';
import { sendTemplateEmail } from './email.service.js';
import { auditLog } from '../utils/audit.js';
import { decrementStockForOrder } from './order.service.js';

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
 * Stripe webhook event processor.
 *
 * Idempotency strategy: claim the webhook key via INSERT ... ON CONFLICT in the SAME transaction
 * as the side effects. If processing fails, ROLLBACK undoes both the claim and the side effects,
 * so a retry can re-process. If it succeeds, the claim prevents duplicate processing of the same
 * webhook event (replays, retries, multiple delivery).
 */
export async function processStripeEvent(event: Stripe.Event): Promise<void> {
  const webhookKey = `stripe_${event.id}`;

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
      [webhookKey, 'stripe', event.type, event.id, '']
    );
    if (claim.rowCount === 0) {
      console.log(`[WEBHOOK] Already processed: ${webhookKey}`);
      await client.query('ROLLBACK');
      return;
    }

    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(client, event.data.object as Stripe.PaymentIntent, pendingEmails);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(client, event.data.object as Stripe.PaymentIntent, pendingEmails);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(client, event.data.object as Stripe.Invoice, pendingEmails);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(client, event.data.object as Stripe.Invoice, pendingEmails);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(client, event.data.object as Stripe.Subscription, pendingEmails);
        break;

      default:
        console.log(`[WEBHOOK] Unhandled Stripe event type: ${event.type}`);
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

// ─── payment_intent.succeeded ────────────────────────────────────────────────

async function handlePaymentIntentSucceeded(
  client: pg.PoolClient,
  paymentIntent: Stripe.PaymentIntent,
  pendingEmails: PendingEmail[],
): Promise<void> {
  // Shop orders are a separate flow — don't touch member activation.
  if (paymentIntent.metadata?.kind === 'shop_order') {
    await handleShopOrderPaid(client, paymentIntent, pendingEmails);
    return;
  }

  const memberId = paymentIntent.metadata?.memberId;
  const amountInReais = paymentIntent.amount / 100;

  // Update payment record
  await client.query(
    `UPDATE payments SET status = 'paid', provider_status = $1, paid_at = NOW(), webhook_processed_at = NOW()
     WHERE provider_id = $2`,
    [paymentIntent.status, paymentIntent.id]
  );

  if (!memberId) {
    console.warn(`[WEBHOOK] payment_intent.succeeded without memberId metadata: ${paymentIntent.id}`);
    return;
  }

  // Activate member
  await activateMember(client, memberId, paymentIntent.id, amountInReais, pendingEmails);

  await auditLog(
    'payment.received',
    null,
    { paymentIntentId: paymentIntent.id, amount: amountInReais },
    memberId,
  );
}

// ─── shop order paid ─────────────────────────────────────────────────────────

async function handleShopOrderPaid(
  client: pg.PoolClient,
  paymentIntent: Stripe.PaymentIntent,
  pendingEmails: PendingEmail[],
): Promise<void> {
  // Idempotent: only the first successful webhook flips 'pending' → 'paid'.
  const updated = await client.query(
    `UPDATE orders SET status = 'paid', paid_at = NOW(), payment_method = 'credit_card'
     WHERE stripe_payment_intent_id = $1 AND status = 'pending'
     RETURNING id, order_number, customer_name, customer_email, total`,
    [paymentIntent.id]
  );

  if (updated.rows.length === 0) {
    // Already processed or order not found — nothing to do.
    return;
  }

  const order = updated.rows[0];

  // Decrement stock now that payment is confirmed.
  await decrementStockForOrder(client, order.id);

  pendingEmails.push({
    template: 'order-confirmed',
    to: order.customer_email,
    variables: {
      name: order.customer_name,
      order_number: String(order.order_number),
      total: parseFloat(order.total).toFixed(2).replace('.', ','),
    },
  });

  await auditLog('order.paid', null, {
    orderId: order.id,
    orderNumber: order.order_number,
    paymentIntentId: paymentIntent.id,
    amount: paymentIntent.amount / 100,
  });
}

// ─── payment_intent.payment_failed ───────────────────────────────────────────

async function handlePaymentIntentFailed(
  client: pg.PoolClient,
  paymentIntent: Stripe.PaymentIntent,
  pendingEmails: PendingEmail[],
): Promise<void> {
  // Shop order failed — cancel it (stock was never decremented).
  if (paymentIntent.metadata?.kind === 'shop_order') {
    await client.query(
      `UPDATE orders SET status = 'cancelled' WHERE stripe_payment_intent_id = $1 AND status = 'pending'`,
      [paymentIntent.id]
    );
    await auditLog('order.payment_failed', null, { paymentIntentId: paymentIntent.id, orderId: paymentIntent.metadata?.orderId });
    return;
  }

  const memberId = paymentIntent.metadata?.memberId;

  // Update payment record
  await client.query(
    `UPDATE payments SET status = 'failed', provider_status = $1, webhook_processed_at = NOW()
     WHERE provider_id = $2`,
    [paymentIntent.status, paymentIntent.id]
  );

  if (!memberId) {
    console.warn(`[WEBHOOK] payment_intent.payment_failed without memberId metadata: ${paymentIntent.id}`);
    return;
  }

  // Queue failure email
  const memberResult = await client.query(
    'SELECT id, email, full_name FROM members WHERE id = $1',
    [memberId]
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

  await auditLog(
    'payment.failed',
    null,
    {
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount / 100,
      providerStatus: paymentIntent.status,
    },
    memberId,
  );
}

// ─── invoice.paid (subscription payment succeeded) ───────────────────────────

async function handleInvoicePaid(
  client: pg.PoolClient,
  invoice: Stripe.Invoice,
  pendingEmails: PendingEmail[],
): Promise<void> {
  const sub = (invoice as unknown as Record<string, unknown>).subscription;
  const subscriptionId = typeof sub === 'string'
    ? sub
    : (sub as { id?: string } | null)?.id;

  if (!subscriptionId) {
    console.log('[WEBHOOK] invoice.paid without subscription — ignoring');
    return;
  }

  const amountInReais = (invoice.amount_paid || 0) / 100;

  // Record subscription payment
  await client.query(
    `INSERT INTO subscription_payments (id, subscription_id, member_id, amount, status, provider_payment_id)
     SELECT $1, id, member_id, $2, 'paid', $3
     FROM subscriptions WHERE provider_id = $4
     ON CONFLICT (id) DO UPDATE SET status = 'paid'`,
    [`sp_${invoice.id}`, amountInReais, invoice.id, subscriptionId]
  );

  // Reset failed_payments counter
  await client.query(
    `UPDATE subscriptions SET failed_payments = 0, last_payment_date = NOW()
     WHERE provider_id = $1`,
    [subscriptionId]
  );

  // Get member + subscription info for expiry extension
  const memberResult = await client.query(
    `SELECT m.id, m.email, m.full_name, m.plan, m.payment_type, s.id as sub_id
     FROM members m
     JOIN subscriptions s ON m.subscription_id = s.id
     WHERE s.provider_id = $1`,
    [subscriptionId]
  );

  if (memberResult.rows.length === 0) {
    console.warn(`[WEBHOOK] invoice.paid — no member found for subscription ${subscriptionId}`);
    return;
  }

  const member = memberResult.rows[0];
  const interval = member.payment_type === 'annual' ? '1 year' : '1 month';

  // Extend member expiry and increment payment count
  await client.query(
    `UPDATE members SET expiry_date = expiry_date + $2::interval, status = 'active',
     payment_count = payment_count + 1
     WHERE id = $1`,
    [member.id, interval]
  );

  // Get updated expiry for email
  const updatedMember = await client.query(
    'SELECT expiry_date FROM members WHERE id = $1',
    [member.id]
  );
  const nextPayment = updatedMember.rows[0]?.expiry_date
    ? new Date(updatedMember.rows[0].expiry_date).toLocaleDateString('pt-BR')
    : '—';

  pendingEmails.push({
    template: 'subscription-payment',
    to: member.email,
    variables: {
      name: member.full_name,
      amount: amountInReais.toFixed(2).replace('.', ','),
      plan: member.plan,
      next_payment: nextPayment,
    },
    member_id: member.id,
  });

  await auditLog(
    'subscription.charge.succeeded',
    null,
    { subscriptionId, invoiceId: invoice.id, amount: amountInReais },
    member.id,
  );
}

// ─── invoice.payment_failed (subscription payment failed) ────────────────────

async function handleInvoicePaymentFailed(
  client: pg.PoolClient,
  invoice: Stripe.Invoice,
  pendingEmails: PendingEmail[],
): Promise<void> {
  const sub = (invoice as unknown as Record<string, unknown>).subscription;
  const subscriptionId = typeof sub === 'string'
    ? sub
    : (sub as { id?: string } | null)?.id;

  if (!subscriptionId) {
    console.log('[WEBHOOK] invoice.payment_failed without subscription — ignoring');
    return;
  }

  const amountInReais = (invoice.amount_due || 0) / 100;

  // Increment failed_payments
  const result = await client.query(
    `UPDATE subscriptions SET failed_payments = failed_payments + 1
     WHERE provider_id = $1
     RETURNING failed_payments, id`,
    [subscriptionId]
  );

  if (result.rows.length === 0) {
    console.warn(`[WEBHOOK] invoice.payment_failed — no subscription found for ${subscriptionId}`);
    return;
  }

  const failedCount = result.rows[0].failed_payments;
  const internalSubId = result.rows[0].id;

  // Get member info for email
  const memberResult = await client.query(
    `SELECT m.id, m.email, m.full_name, m.plan
     FROM members m
     WHERE m.subscription_id = $1`,
    [internalSubId]
  );

  const member = memberResult.rows[0];

  if (member) {
    pendingEmails.push({
      template: 'subscription-payment-failed',
      to: member.email,
      variables: {
        name: member.full_name,
        amount: amountInReais.toFixed(2).replace('.', ','),
        failed_count: String(failedCount),
      },
      member_id: member.id,
    });

    await auditLog(
      'subscription.charge.failed',
      null,
      { subscriptionId, invoiceId: invoice.id, failedCount, amount: amountInReais },
      member.id,
    );
  }

  // After 3 failures, cancel subscription
  if (failedCount >= 3) {
    await client.query(
      `UPDATE subscriptions SET status = 'cancelled', cancelled_at = NOW()
       WHERE provider_id = $1`,
      [subscriptionId]
    );
    await client.query(
      `UPDATE members SET subscription_status = 'cancelled', auto_renewal = FALSE
       WHERE subscription_id = $1`,
      [internalSubId]
    );

    if (member) {
      pendingEmails.push({
        template: 'subscription-cancelled',
        to: member.email,
        variables: { name: member.full_name },
        member_id: member.id,
      });

      await auditLog(
        'subscription.cancelled',
        null,
        { subscriptionId, reason: 'failed_payments_threshold', failedCount },
        member.id,
      );
    }
  }
}

// ─── customer.subscription.deleted (cancelled externally) ────────────────────

async function handleSubscriptionDeleted(
  client: pg.PoolClient,
  subscription: Stripe.Subscription,
  pendingEmails: PendingEmail[],
): Promise<void> {
  const stripeSubId = subscription.id;

  // Update subscription record
  await client.query(
    `UPDATE subscriptions SET status = 'cancelled', cancelled_at = NOW()
     WHERE provider_id = $1`,
    [stripeSubId]
  );

  // Update member
  const memberResult = await client.query(
    `UPDATE members SET subscription_status = 'cancelled', auto_renewal = FALSE
     FROM subscriptions s
     WHERE members.subscription_id = s.id AND s.provider_id = $1
     RETURNING members.id, members.email, members.full_name`,
    [stripeSubId]
  );

  if (memberResult.rows.length > 0) {
    const member = memberResult.rows[0];

    pendingEmails.push({
      template: 'subscription-cancelled',
      to: member.email,
      variables: { name: member.full_name },
      member_id: member.id,
    });

    await auditLog(
      'subscription.cancelled',
      null,
      { subscriptionId: stripeSubId, reason: 'cancelled_externally' },
      member.id,
    );
  }
}

// ─── Shared: activate member after one-time payment ──────────────────────────

async function activateMember(
  client: pg.PoolClient,
  memberId: string,
  paymentRef: string,
  amount: number,
  pendingEmails: PendingEmail[],
): Promise<void> {
  // Snapshot member for audit
  const memberLookup = await client.query(
    'SELECT id, payment_type, status, expiry_date FROM members WHERE id = $1 FOR UPDATE',
    [memberId]
  );
  if (memberLookup.rows.length === 0) return;

  const member = memberLookup.rows[0];
  const beforeStatus = member.status;
  const now = new Date();

  // For renewals: extend from current expiry so member doesn't lose remaining days.
  // For new activations (pending/expired): start from today.
  const currentExpiry = member.expiry_date ? new Date(member.expiry_date) : null;
  const isRenewal = member.status === 'active' && currentExpiry && currentExpiry > now;
  const baseDate = isRenewal ? currentExpiry : now;

  const expiryDate = new Date(baseDate);
  if (member.payment_type === 'annual') {
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
  } else {
    expiryDate.setMonth(expiryDate.getMonth() + 1);
  }

  await client.query(
    `UPDATE members SET status = 'active', start_date = COALESCE(start_date, $1), expiry_date = $2,
     activated_at = COALESCE(activated_at, NOW()), activated_by_payment = $3, pending_payment = NULL,
     payment_count = payment_count + 1
     WHERE id = $4`,
    [now.toISOString().split('T')[0], expiryDate.toISOString().split('T')[0], paymentRef, member.id]
  );

  await auditLog(
    'member.activated',
    null,
    {
      paymentRef,
      amount,
      before: { status: beforeStatus },
      after: { status: 'active', expiryDate: expiryDate.toISOString().split('T')[0] },
    },
    member.id,
  );

  // Queue confirmation + welcome emails — sent after COMMIT
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

    // Send welcome email on first activation only
    if (beforeStatus !== 'active') {
      pendingEmails.push({
        template: 'welcome',
        to: m.email,
        variables: { name: m.full_name, plan: m.plan },
        member_id: m.id,
      });
    }
  }
}
