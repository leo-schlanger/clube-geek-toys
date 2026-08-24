import pg from 'pg';
import Stripe from 'stripe';
import { getClient } from '../config/database.js';
import { sendTemplateEmail } from './email.service.js';
import { auditLog } from '../utils/audit.js';
import { decrementStockForOrder, restoreStockForOrder, releaseReservation } from './order.service.js';
import { restoreCreditForOrder } from './store-credit.service.js';
import { env } from '../config/env.js';

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
  const pendingCreditRestores: string[] = [];

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
        await handlePaymentIntentFailed(
          client,
          event.data.object as Stripe.PaymentIntent,
          pendingEmails
        );
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

      // Only an explicit cancel ends a shop order. A decline does not — see
      // `handlePaymentIntentFailed`.
      case 'payment_intent.canceled':
        await handlePaymentIntentCanceled(
          client,
          event.data.object as Stripe.PaymentIntent,
          pendingCreditRestores
        );
        break;

      // A refund issued from the Stripe Dashboard — which is how a shopkeeper
      // actually refunds — used to never reach the database at all: the order
      // stayed `paid`, counted as revenue, stock stayed decremented and the
      // store credit never came back.
      case 'charge.refunded':
        await handleChargeRefunded(
          client,
          event.data.object as Stripe.Charge,
          pendingCreditRestores
        );
        break;

      // Money is already gone from the account; a human has to decide what to
      // do about it, so this only raises the flag.
      case 'charge.dispute.created':
        await handleDisputeCreated(client, event.data.object as Stripe.Dispute, pendingEmails);
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

  // Side effects AFTER commit so they reflect persisted state. The queue is fed
  // by the cancel and refund handlers; a mere decline no longer enqueues
  // anything, because it no longer ends the order.
  for (const orderId of pendingCreditRestores) {
    try {
      const amount = await restoreCreditForOrder(orderId, {
        note: 'Crédito devolvido (pedido cancelado ou reembolsado)',
      });
      if (amount > 0) {
        await auditLog('order.credit_restored', null, { orderId, amount, reason: 'order_closed' });
      }
    } catch (err) {
      console.error(`[WEBHOOK] Credit restore failed (order=${orderId}):`, err);
    }
  }

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

// ─── payment_intent.canceled ─────────────────────────────────────────────────

/** The one event that actually ends a shop order. */
async function handlePaymentIntentCanceled(
  client: pg.PoolClient,
  paymentIntent: Stripe.PaymentIntent,
  pendingCreditRestores: string[],
): Promise<void> {
  if (paymentIntent.metadata?.kind !== 'shop_order') return;

  const cancelled = await client.query(
    `UPDATE orders SET status = 'cancelled'
      WHERE stripe_payment_intent_id = $1 AND status = 'pending'
      RETURNING id, store_credit_applied`,
    [paymentIntent.id]
  );
  const row = cancelled.rows[0];
  if (!row) return;

  // The hold outlives the order otherwise: the TTL sweep only visits `pending`.
  await releaseReservation(client, row.id as string);
  if (parseFloat(row.store_credit_applied || '0') > 0) {
    pendingCreditRestores.push(row.id as string);
  }
  await auditLog('order.payment_cancelled', null, {
    paymentIntentId: paymentIntent.id,
    orderId: row.id,
  });
}

// ─── charge.refunded ─────────────────────────────────────────────────────────

/**
 * Refund made outside the app (Stripe Dashboard) or by `refundOrder`.
 *
 * Idempotent through the status guard. A partial refund is treated the same as
 * a full one on purpose: the shop has no concept of a partially refunded order,
 * and leaving it `paid` would keep counting the whole amount as revenue.
 */
async function handleChargeRefunded(
  client: pg.PoolClient,
  charge: Stripe.Charge,
  pendingCreditRestores: string[],
): Promise<void> {
  const paymentIntentId =
    typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId) return;

  const updated = await client.query(
    `UPDATE orders SET status = 'refunded', updated_at = NOW()
      WHERE stripe_payment_intent_id = $1 AND status <> 'refunded'
      RETURNING id, order_number, status, store_credit_applied`,
    [paymentIntentId]
  );
  const row = updated.rows[0];
  if (!row) return;

  await restoreStockForOrder(client, row.id as string);
  if (parseFloat(row.store_credit_applied || '0') > 0) {
    pendingCreditRestores.push(row.id as string);
  }
  await auditLog('order.refunded_via_stripe', null, {
    orderId: row.id,
    orderNumber: row.order_number,
    paymentIntentId,
    amountRefunded: charge.amount_refunded / 100,
    partial: charge.amount_refunded < charge.amount,
  });
}

// ─── charge.dispute.created ──────────────────────────────────────────────────

/** A chargeback needs a person, not an automatic status change. */
async function handleDisputeCreated(
  client: pg.PoolClient,
  dispute: Stripe.Dispute,
  pendingEmails: PendingEmail[],
): Promise<void> {
  const paymentIntentId =
    typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id;

  const found = paymentIntentId
    ? await client.query(
        `SELECT id, order_number, customer_name, customer_email
           FROM orders WHERE stripe_payment_intent_id = $1`,
        [paymentIntentId]
      )
    : { rows: [] as pg.QueryResultRow[] };
  const order = found.rows[0];

  await auditLog('order.disputed', null, {
    orderId: order?.id ?? null,
    orderNumber: order?.order_number ?? null,
    paymentIntentId: paymentIntentId ?? null,
    reason: dispute.reason,
    amount: dispute.amount / 100,
  });

  if (env.ADMIN_EMAIL) {
    pendingEmails.push({
      template: 'admin-order-disputed',
      to: env.ADMIN_EMAIL,
      variables: {
        order_number: order ? String(order.order_number) : '—',
        customer_name: (order?.customer_name as string) ?? '—',
        customer_email: (order?.customer_email as string) ?? '—',
        amount: (dispute.amount / 100).toFixed(2).replace('.', ','),
        reason: dispute.reason,
        due_by: dispute.evidence_details?.due_by
          ? new Date(dispute.evidence_details.due_by * 1000).toLocaleDateString('pt-BR')
          : '—',
      },
    });
  }
}

// ─── shop order paid ─────────────────────────────────────────────────────────

async function handleShopOrderPaid(
  client: pg.PoolClient,
  paymentIntent: Stripe.PaymentIntent,
  pendingEmails: PendingEmail[],
): Promise<void> {
  // Idempotent: only the first successful webhook flips the order to 'paid'.
  //
  // `cancelled` is accepted alongside `pending` on purpose. Captured money must
  // always land on the order — if anything cancelled it while the charge was in
  // flight, silently dropping the success is the worst of both worlds. Anything
  // already `paid` (or beyond) matches nothing and returns below.
  const updated = await client.query(
    `UPDATE orders SET status = 'paid', paid_at = NOW(), payment_method = 'credit_card'
     WHERE stripe_payment_intent_id = $1 AND status IN ('pending', 'cancelled')
     RETURNING id, order_number, customer_name, customer_email, total, status`,
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
      order_id: order.id,
      delivery_method: order.delivery_method || 'shipping',
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
  // Shop order: record the decline, but **do not cancel**.
  //
  // Stripe fires `payment_failed` on every declined confirmation, not only on a
  // terminal failure. The PaymentIntent stays usable and the checkout form
  // reuses the same clientSecret — "card refused, try another one" is the most
  // ordinary path there is. Cancelling here meant the retry succeeded against a
  // dead order: `handleShopOrderPaid` looks for `status = 'pending'`, found
  // nothing, and returned in silence. Money captured, order cancelled, stock
  // never decremented, no e-mail. It also left `stock_reserved = TRUE` forever,
  // since the TTL sweep only looks at `pending` orders.
  //
  // Leaving it `pending` keeps the hold for the retry, and the cron releases it
  // if the buyer walks away. Only `payment_intent.canceled` ends the order.
  if (paymentIntent.metadata?.kind === 'shop_order') {
    await auditLog('order.payment_failed', null, {
      paymentIntentId: paymentIntent.id,
      orderId: paymentIntent.metadata?.orderId,
      lastPaymentError: paymentIntent.last_payment_error?.code ?? null,
    });
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

  // Mirror the invoice into `payments`, which is the ONLY table the reports
  // read. `subscription_payments` is consulted in exactly one place — the
  // member's own statement — so every recurring charge from the second month on
  // was invisible to the dashboard, the monthly comparison and realtime-stats.
  // Club revenue showed as zero and the curve looked like total churn.
  //
  // Guarded on `provider_id`, so a re-delivery (or `invoice.payment_succeeded`,
  // should it ever be handled too) cannot count the same invoice twice.
  await client.query(
    `INSERT INTO payments (member_id, amount, method, status, provider_id, provider_status, reference, paid_at)
     SELECT m.id, $1, 'credit_card', 'paid', $2, 'invoice.paid', $2, NOW()
       FROM members m
       JOIN subscriptions s ON m.subscription_id = s.id
      WHERE s.provider_id = $3
        AND NOT EXISTS (SELECT 1 FROM payments WHERE provider_id = $2)`,
    [amountInReais, invoice.id, subscriptionId]
  );

  // Reset failed_payments counter. `next_payment_date` is in the schema and is
  // exposed by the API, but nothing ever wrote it — the subscriber always saw
  // "próxima cobrança: —". The invoice carries the period end.
  const periodEnd = (invoice as unknown as Record<string, unknown>).period_end;
  await client.query(
    `UPDATE subscriptions
        SET failed_payments = 0,
            last_payment_date = NOW(),
            next_payment_date = COALESCE($2::timestamptz, next_payment_date)
      WHERE provider_id = $1`,
    [
      subscriptionId,
      typeof periodEnd === 'number' ? new Date(periodEnd * 1000).toISOString() : null,
    ]
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

  // Extend member expiry and increment payment count.
  //
  // `expiry_date` is nullable and `createMember` never sets it, so a first
  // subscription invoice used to compute `NULL + interval = NULL` — leaving a
  // paying member `active` with no expiry, which reads as expired everywhere it
  // matters: the 10% shop discount (`order.service.ts`) and the digital card
  // (`member.routes.ts`) both require `expiry_date >= CURRENT_DATE`. A member
  // returning after a lapse hit the same wall from the other side, extending a
  // date already months in the past. Anchor on today whenever the stored date
  // is missing or stale — the one-off payment path already does this.
  await client.query(
    `UPDATE members
        SET expiry_date = GREATEST(COALESCE(expiry_date, CURRENT_DATE), CURRENT_DATE) + $2::interval,
            status = 'active',
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

  // Update member.
  //
  // `subscription_status <> 'cancelled'` is what stops the duplicate e-mail.
  // `cancelSubscription` mails the member and then calls
  // `stripe.subscriptions.cancel()`, which fires this very event — so the
  // member was getting told twice for one cancellation. Zero rows here means
  // the app already handled it and already wrote to them; a cancellation made
  // straight in the Stripe Dashboard still finds the member `authorized` and
  // is announced normally.
  const memberResult = await client.query(
    `UPDATE members SET subscription_status = 'cancelled', auto_renewal = FALSE
     FROM subscriptions s
     WHERE members.subscription_id = s.id
       AND s.provider_id = $1
       AND members.subscription_status <> 'cancelled'
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
  expiryDate.setMonth(expiryDate.getMonth() + 1);

  await client.query(
    `UPDATE members SET status = 'active', start_date = COALESCE(start_date, $1), expiry_date = $2,
     activated_at = COALESCE(activated_at, NOW()), activated_by_payment = $3, pending_payment = NULL,
     payment_count = payment_count + 1, payment_type = 'monthly'
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
