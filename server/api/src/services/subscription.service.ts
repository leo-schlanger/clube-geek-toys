import { query, getClient } from '../config/database.js';
import { AppError } from '../middleware/error-handler.js';
import { getStripe, getOrCreateCustomer } from '../utils/stripe.js';
import { sendTemplateEmail } from './email.service.js';
import { auditLog } from '../utils/audit.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CreateSubscriptionData {
  member_id: string;
  plan: string;
  frequency_type: string;
  payer_email: string;
  payer_name: string;
  transaction_amount: number;
}

interface SubscriptionRow {
  id: string;
  member_id: string;
  provider_id: string;
  status: string;
  plan: string;
  frequency_type: string;
  transaction_amount: string;
  next_payment_date: string | null;
  last_payment_date: string | null;
  failed_payments: number;
  card_last_four: string | null;
  card_brand: string | null;
  payer_email: string | null;
  created_at: string;
  cancelled_at: string | null;
  paused_at: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapSubscriptionRow(row: SubscriptionRow) {
  return {
    id: row.id,
    memberId: row.member_id,
    providerId: row.provider_id,
    status: row.status,
    plan: row.plan,
    frequencyType: row.frequency_type,
    transactionAmount: parseFloat(row.transaction_amount),
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

/**
 * Fetch subscription row from DB and assert it exists.
 * Returns raw DB row for internal use.
 */
async function fetchSubscriptionOrThrow(id: string): Promise<SubscriptionRow> {
  const result = await query('SELECT * FROM subscriptions WHERE id = $1', [id]);
  if (result.rows.length === 0) {
    throw new AppError(404, 'Assinatura não encontrada', 'SUBSCRIPTION_NOT_FOUND');
  }
  return result.rows[0] as SubscriptionRow;
}

// ─── createSubscription ──────────────────────────────────────────────────────

export async function createSubscription(data: CreateSubscriptionData) {
  const stripe = getStripe();

  // 1. Lookup member to pass to getOrCreateCustomer
  const memberResult = await query(
    'SELECT id, email, full_name, stripe_customer_id FROM members WHERE id = $1',
    [data.member_id],
  );
  if (memberResult.rows.length === 0) {
    throw new AppError(404, 'Membro não encontrado', 'MEMBER_NOT_FOUND');
  }
  const member = memberResult.rows[0];

  // 2. Get or create Stripe Customer
  const customerId = await getOrCreateCustomer({
    id: member.id,
    email: data.payer_email,
    fullName: data.payer_name,
    stripeCustomerId: member.stripe_customer_id,
  });

  // 3. Create Stripe Subscription (incomplete — client confirms via PaymentElement)
  const paymentType = data.frequency_type === 'years' ? 'annual' : 'monthly';
  const interval = paymentType === 'annual' ? 'year' : 'month';

  // Create a Stripe Product + Price inline via price_data.
  // Stripe requires either `price` (pre-created) or `price_data` with `product`.
  // We use ad-hoc products via `product_data` which Stripe auto-creates.
  const stripeSubscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [
      {
        // Stripe's TS types may not include product_data on subscription items,
        // but the API does support it (creates a product inline).
         
        price_data: {
          currency: 'brl',
          product_data: {
            name: `Clube GeekPop & Toys - Plano ${data.plan.charAt(0).toUpperCase() + data.plan.slice(1)}`,
          },
          unit_amount: Math.round(data.transaction_amount * 100),
          recurring: { interval: interval as 'month' | 'year' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      },
    ],
    payment_behavior: 'default_incomplete',
    payment_settings: {
      save_default_payment_method: 'on_subscription',
    },
    metadata: {
      memberId: data.member_id,
      plan: data.plan,
    },
    expand: ['latest_invoice.payment_intent'],
  });

  // 4. Extract client_secret from expanded invoice -> payment_intent
  const invoice = stripeSubscription.latest_invoice as unknown as Record<string, unknown>;
  const paymentIntent = (invoice?.payment_intent || {}) as Record<string, unknown>;
  const clientSecret = (paymentIntent?.client_secret as string) ?? null;

  const subscriptionId = `sub_${stripeSubscription.id}`;
  const status = stripeSubscription.status === 'active' ? 'authorized' : 'pending';

  // 5. Persist in DB inside a transaction
  const client = await getClient();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO subscriptions
         (id, member_id, provider_id, status, plan, frequency_type, transaction_amount, payer_email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        subscriptionId,
        data.member_id,
        stripeSubscription.id,
        status,
        data.plan,
        data.frequency_type,
        data.transaction_amount,
        data.payer_email,
      ],
    );

    await client.query(
      `UPDATE members SET subscription_id = $1, subscription_status = $2, auto_renewal = TRUE WHERE id = $3`,
      [subscriptionId, status, data.member_id],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // 6. Audit log (non-blocking)
  auditLog('subscription.created', data.member_id, {
    subscriptionId,
    stripeSubscriptionId: stripeSubscription.id,
    plan: data.plan,
    amount: data.transaction_amount,
  }).catch(() => {});

  // 7. Send confirmation email (outside transaction, non-blocking)
  sendTemplateEmail({
    template: 'subscription-created',
    to: member.email,
    variables: {
      name: member.full_name,
      plan: data.plan,
      amount: data.transaction_amount.toFixed(2).replace('.', ','),
      card_last_four: '****',
    },
    member_id: data.member_id,
  }).catch((err: unknown) => console.error('[SUBSCRIPTION] Email error:', err));

  return { id: subscriptionId, clientSecret, status };
}

// ─── getSubscription ─────────────────────────────────────────────────────────

export async function getSubscription(id: string) {
  const result = await query('SELECT * FROM subscriptions WHERE id = $1', [id]);
  if (result.rows.length === 0) return null;
  return mapSubscriptionRow(result.rows[0] as SubscriptionRow);
}

// ─── pauseSubscription ───────────────────────────────────────────────────────

export async function pauseSubscription(id: string) {
  const sub = await fetchSubscriptionOrThrow(id);
  const stripe = getStripe();

  // Pause on Stripe (void upcoming invoices while paused)
  await stripe.subscriptions.update(sub.provider_id, {
    pause_collection: { behavior: 'void' },
  });

  // Update DB in transaction
  const dbClient = await getClient();
  let resultRow: SubscriptionRow;
  try {
    await dbClient.query('BEGIN');

    const result = await dbClient.query(
      `UPDATE subscriptions SET status = 'paused', paused_at = NOW() WHERE id = $1 RETURNING *`,
      [id],
    );
    resultRow = result.rows[0] as SubscriptionRow;

    await dbClient.query(
      `UPDATE members SET subscription_status = 'paused' WHERE subscription_id = $1`,
      [id],
    );

    await dbClient.query('COMMIT');
  } catch (err) {
    await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    dbClient.release();
  }

  // Audit (non-blocking)
  auditLog('subscription.paused', sub.member_id, {
    subscriptionId: id,
    stripeSubscriptionId: sub.provider_id,
  }).catch(() => {});

  // Email notification (outside transaction, non-blocking)
  const memberResult = await query(
    'SELECT full_name, email, id FROM members WHERE subscription_id = $1',
    [id],
  );
  if (memberResult.rows.length > 0) {
    const member = memberResult.rows[0];
    sendTemplateEmail({
      template: 'subscription-paused',
      to: member.email,
      variables: { name: member.full_name },
      member_id: member.id,
    }).catch((err: unknown) => console.error('[SUBSCRIPTION] Email error:', err));
  }

  return mapSubscriptionRow(resultRow);
}

// ─── resumeSubscription ──────────────────────────────────────────────────────

export async function resumeSubscription(id: string) {
  const sub = await fetchSubscriptionOrThrow(id);
  const stripe = getStripe();

  // Resume on Stripe (clear pause_collection)
  await stripe.subscriptions.update(sub.provider_id, {
    pause_collection: '',
  });

  // Update DB in transaction
  const dbClient = await getClient();
  let resultRow: SubscriptionRow;
  try {
    await dbClient.query('BEGIN');

    const result = await dbClient.query(
      `UPDATE subscriptions SET status = 'authorized', paused_at = NULL WHERE id = $1 RETURNING *`,
      [id],
    );
    resultRow = result.rows[0] as SubscriptionRow;

    await dbClient.query(
      `UPDATE members SET subscription_status = 'authorized' WHERE subscription_id = $1`,
      [id],
    );

    await dbClient.query('COMMIT');
  } catch (err) {
    await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    dbClient.release();
  }

  // Audit (non-blocking)
  auditLog('subscription.resumed', sub.member_id, {
    subscriptionId: id,
    stripeSubscriptionId: sub.provider_id,
  }).catch(() => {});

  // Email notification (outside transaction, non-blocking)
  const memberResult = await query(
    'SELECT full_name, email, id FROM members WHERE subscription_id = $1',
    [id],
  );
  if (memberResult.rows.length > 0) {
    const member = memberResult.rows[0];
    sendTemplateEmail({
      template: 'subscription-resumed',
      to: member.email,
      variables: { name: member.full_name },
      member_id: member.id,
    }).catch((err: unknown) => console.error('[SUBSCRIPTION] Email error:', err));
  }

  return mapSubscriptionRow(resultRow);
}

// ─── cancelSubscription ──────────────────────────────────────────────────────

export async function cancelSubscription(id: string) {
  const sub = await fetchSubscriptionOrThrow(id);
  const stripe = getStripe();

  // Cancel on Stripe
  await stripe.subscriptions.cancel(sub.provider_id);

  // Update DB in transaction
  const dbClient = await getClient();
  let resultRow: SubscriptionRow;
  try {
    await dbClient.query('BEGIN');

    const result = await dbClient.query(
      `UPDATE subscriptions SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1 RETURNING *`,
      [id],
    );
    resultRow = result.rows[0] as SubscriptionRow;

    await dbClient.query(
      `UPDATE members SET subscription_status = 'cancelled', auto_renewal = FALSE WHERE subscription_id = $1`,
      [id],
    );

    await dbClient.query('COMMIT');
  } catch (err) {
    await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    dbClient.release();
  }

  // Audit (non-blocking)
  auditLog('subscription.cancelled', sub.member_id, {
    subscriptionId: id,
    stripeSubscriptionId: sub.provider_id,
  }).catch(() => {});

  // Email notification (outside transaction, non-blocking)
  const memberResult = await query(
    'SELECT full_name, email, id FROM members WHERE subscription_id = $1',
    [id],
  );
  if (memberResult.rows.length > 0) {
    const member = memberResult.rows[0];
    sendTemplateEmail({
      template: 'subscription-cancelled',
      to: member.email,
      variables: { name: member.full_name },
      member_id: member.id,
    }).catch((err: unknown) => console.error('[SUBSCRIPTION] Email error:', err));
  }

  return mapSubscriptionRow(resultRow);
}

// ─── updatePaymentMethod ─────────────────────────────────────────────────────

export async function updatePaymentMethod(subscriptionId: string, paymentMethodId: string) {
  const sub = await fetchSubscriptionOrThrow(subscriptionId);
  const stripe = getStripe();

  // Attach payment method to customer if not already attached
  const stripeSubscription = await stripe.subscriptions.retrieve(sub.provider_id);
  const customerId = stripeSubscription.customer as string;

  await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });

  // Set as default payment method on the subscription
  await stripe.subscriptions.update(sub.provider_id, {
    default_payment_method: paymentMethodId,
  });

  // Retrieve payment method details to persist card info
  const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
  const cardLastFour = pm.card?.last4 ?? null;
  const cardBrand = pm.card?.brand ?? null;

  await query(
    `UPDATE subscriptions SET card_last_four = $2, card_brand = $3 WHERE id = $1`,
    [subscriptionId, cardLastFour, cardBrand],
  );

  // Audit (non-blocking)
  auditLog('subscription.payment_method_updated', sub.member_id, {
    subscriptionId,
    paymentMethodId,
    cardBrand,
    cardLastFour,
  }).catch(() => {});

  return {
    message: 'Método de pagamento atualizado com sucesso',
    cardLastFour,
    cardBrand,
  };
}

// ─── getSubscriptionPayments ─────────────────────────────────────────────────

export async function getSubscriptionPayments(subscriptionId: string, limit?: number) {
  const maxRows = Math.min(limit || 20, 100);
  const result = await query(
    `SELECT * FROM subscription_payments
     WHERE subscription_id = $1
     ORDER BY payment_date DESC
     LIMIT $2`,
    [subscriptionId, maxRows],
  );

  return result.rows.map((row) => ({
    id: row.id,
    subscriptionId: row.subscription_id,
    memberId: row.member_id,
    amount: parseFloat(row.amount),
    status: row.status,
    paymentDate: row.payment_date,
    providerPaymentId: row.provider_payment_id,
    failureReason: row.failure_reason,
  }));
}

export { mapSubscriptionRow };
