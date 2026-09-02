import { query, getClient } from '../config/database.js';
import { AppError } from '../middleware/error-handler.js';
import { isValidCPF } from '../utils/cpf.js';
import { isValidCnpj } from '../utils/cnpj.js';
import { getStripe } from '../utils/stripe.js';
import * as pagarme from '../utils/pagarme.js';
import { env } from '../config/env.js';
import { sendTemplateEmail } from './email.service.js';
import { notifyAdminsOfPaymentAsync } from './admin-notification.service.js';
import { auditLog } from '../utils/audit.js';
import {
  CLUB_PLAN_PRICE,
  CLUB_PLAN_PAYMENT_TYPE,
  CLUB_PLAN_FREQUENCY_TYPE,
  CLUB_PLAN_INTERVAL,
} from '../types/index.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CreateSubscriptionData {
  member_id: string;
  plan: string;
  /** Ignored server-side — the club plan is always monthly. */
  frequency_type?: string;
  payer_email: string;
  payer_name: string;
  /** Ignored server-side — amount is always CLUB_PLAN_PRICE for the club plan. */
  transaction_amount?: number;
  /** Pagar.me card token, produced in the browser with the public key. */
  card_token: string;
}

interface SubscriptionRow {
  id: string;
  member_id: string;
  provider_id: string;
  /** 'pagarme' for anything created after the migration; 'stripe' before it. */
  provider?: string | null;
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
    provider: row.provider ?? 'stripe',
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

/**
 * Which provider bills a subscription.
 *
 * Read from the stored column, defaulting to Stripe: rows written before the
 * migration have no `provider`, and every one of them is a Stripe subscription.
 */
function providerOf(sub: SubscriptionRow): 'pagarme' | 'stripe' {
  return sub.provider === 'pagarme' ? 'pagarme' : 'stripe';
}

// ─── createSubscription ──────────────────────────────────────────────────────

export async function createSubscription(data: CreateSubscriptionData) {
  if (!data.card_token) {
    throw new AppError(400, 'Cartão não informado.', 'CARD_TOKEN_REQUIRED');
  }

  // 1. The member, with the document the acquirer requires.
  const memberResult = await query(
    'SELECT id, email, full_name, cpf, phone, pagarme_customer_id FROM members WHERE id = $1',
    [data.member_id],
  );
  if (memberResult.rows.length === 0) {
    throw new AppError(404, 'Membro não encontrado', 'MEMBER_NOT_FOUND');
  }
  const member = memberResult.rows[0];
  const document = pagarme.normalizeDocument(member.cpf);
  // Check digits, not just length: a placeholder like 111.111.111-11 is eleven
  // characters and would come back from the acquirer as a field-path 422 the
  // member cannot act on, after the recurrence was already half set up.
  const documentIsValid =
    document.length === 11 ? isValidCPF(document) : document.length === 14 && isValidCnpj(document);
  if (!documentIsValid) {
    throw new AppError(
      400,
      'Cadastro sem CPF válido. Atualize seus dados antes de assinar.',
      'MEMBER_DOCUMENT_MISSING',
    );
  }

  // 2. Pagar.me customer, created once and reused.
  const customerId = await pagarme.getOrCreatePagarmeCustomer({
    id: member.id,
    email: data.payer_email || member.email,
    fullName: data.payer_name || member.full_name,
    document,
    phone: member.phone,
    pagarmeCustomerId: member.pagarme_customer_id,
  });

  // 3. Amount and interval are locked to the club plan server-side. Trusting
  //    the client's `transaction_amount` and `frequency_type` would let someone
  //    ask for `years` and buy a whole year at the monthly price.
  const amount = CLUB_PLAN_PRICE;
  const paymentType = CLUB_PLAN_PAYMENT_TYPE;
  const interval = CLUB_PLAN_INTERVAL;

  // `prepaid` bills at the start of each cycle, which matches how the member's
  // `expiry_date` is extended when `invoice.paid` arrives.
  const remote = await pagarme.createSubscription({
    customer_id: customerId,
    payment_method: 'credit_card',
    card_token: data.card_token,
    interval,
    interval_count: 1,
    billing_type: 'prepaid',
    installments: 1,
    statement_descriptor: env.PAGARME_STATEMENT_DESCRIPTOR,
    items: [
      {
        description: `Clube GeekPop & Toys - Plano ${data.plan.charAt(0).toUpperCase() + data.plan.slice(1)}`,
        quantity: 1,
        pricing_scheme: { price: pagarme.toCents(amount) },
      },
    ],
    code: data.member_id,
    metadata: { memberId: data.member_id, plan: data.plan },
  });

  const subscriptionId = `sub_${remote.id}`;
  // Pagar.me returns `active` once the first charge is authorised; anything
  // else is still settling and the webhook will move it.
  const status = remote.status === 'active' ? 'authorized' : 'pending';

  // 4. Persist in DB inside a transaction
  const client = await getClient();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO subscriptions
         (id, member_id, provider_id, provider, status, plan, frequency_type,
          transaction_amount, payer_email, card_brand, card_last_four, next_payment_date)
       VALUES ($1, $2, $3, 'pagarme', $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        subscriptionId,
        data.member_id,
        remote.id,
        status,
        data.plan,
        CLUB_PLAN_FREQUENCY_TYPE,
        amount,
        data.payer_email,
        remote.card?.brand ?? null,
        remote.card?.last_four_digits ?? null,
        remote.next_billing_at ?? null,
      ],
    );

    await client.query(
      `UPDATE members SET subscription_id = $1, subscription_status = $2, auto_renewal = TRUE, payment_type = $4 WHERE id = $3`,
      [subscriptionId, status, data.member_id, paymentType],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // 5. Audit log (non-blocking)
  auditLog('subscription.created', data.member_id, {
    subscriptionId,
    provider: 'pagarme',
    pagarmeSubscriptionId: remote.id,
    plan: data.plan,
    amount,
  }).catch(() => {});

  // 6. Confirmation email (outside the transaction, non-blocking)
  sendTemplateEmail({
    template: 'subscription-created',
    to: member.email,
    variables: {
      name: member.full_name,
      plan: data.plan,
      amount: amount.toFixed(2).replace('.', ','),
      card_last_four: remote.card?.last_four_digits ?? '****',
    },
    member_id: data.member_id,
  }).catch((err: unknown) => console.error('[SUBSCRIPTION] Email error:', err));

  notifyAdminsOfPaymentAsync({
    event: status === 'authorized' ? 'payment_received' : 'payment_pending',
    subject: `Nova assinatura — ${member.full_name}`,
    amount,
    method: 'credit_card',
    customerName: member.full_name,
    customerEmail: member.email,
    link: '/admin?tab=members',
    detail: 'Assinatura mensal recorrente.',
    chargeId: remote.id,
  });

  return {
    id: subscriptionId,
    status,
    provider: 'pagarme' as const,
    cardBrand: remote.card?.brand ?? null,
    cardLastFour: remote.card?.last_four_digits ?? null,
    nextBillingAt: remote.next_billing_at ?? null,
  };
}

// ─── getSubscription ─────────────────────────────────────────────────────────

export async function getSubscription(id: string) {
  const result = await query('SELECT * FROM subscriptions WHERE id = $1', [id]);
  if (result.rows.length === 0) return null;
  return mapSubscriptionRow(result.rows[0] as SubscriptionRow);
}

// ─── pauseSubscription ───────────────────────────────────────────────────────

/**
 * Stop billing without ending the membership.
 *
 * The two providers differ here and the difference is visible to the member.
 * Stripe voids the upcoming invoices and the same subscription resumes later.
 * Pagar.me has no pause, so pausing **cancels** the recurrence at the provider
 * and keeps our row as `paused`; resuming then needs a card again, because the
 * old one went with the cancelled subscription. `resumeSubscription` says so.
 */
export async function pauseSubscription(id: string) {
  const sub = await fetchSubscriptionOrThrow(id);

  if (providerOf(sub) === 'pagarme') {
    await pagarme.cancelSubscription(sub.provider_id);
  } else {
    const stripe = getStripe();
    // Pause on Stripe (void upcoming invoices while paused)
    await stripe.subscriptions.update(sub.provider_id, {
      pause_collection: { behavior: 'void' },
    });
  }

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
    provider: providerOf(sub),
    providerSubscriptionId: sub.provider_id,
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

/**
 * Start billing again.
 *
 * A Stripe subscription simply un-pauses. A Pagar.me one was cancelled at the
 * provider when it was paused (they have no pause), so resuming means creating
 * a new recurrence — which needs a card. Rather than fail with something
 * cryptic, the caller is told exactly that, and the SPA sends the member back
 * through the card form.
 */
export async function resumeSubscription(id: string) {
  const sub = await fetchSubscriptionOrThrow(id);

  if (providerOf(sub) === 'pagarme') {
    throw new AppError(
      409,
      'Para voltar a cobrar, informe o cartão novamente — a recorrência foi encerrada na operadora quando a assinatura foi pausada.',
      'RESUME_REQUIRES_CARD',
    );
  }

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
    provider: providerOf(sub),
    providerSubscriptionId: sub.provider_id,
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

  if (providerOf(sub) === 'pagarme') {
    await pagarme.cancelSubscription(sub.provider_id);
  } else {
    const stripe = getStripe();
    await stripe.subscriptions.cancel(sub.provider_id);
  }

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
    provider: providerOf(sub),
    providerSubscriptionId: sub.provider_id,
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

/**
 * Point a subscription at a different card.
 *
 * Pagar.me takes a `card_token` — the same one-shot token the browser makes
 * with the public key — and swaps it on the existing recurrence, so the billing
 * cycle and the member's expiry date are untouched. Stripe subscriptions still
 * take a PaymentMethod id; the two are told apart by the stored provider, not
 * by guessing at the string.
 */
export async function updatePaymentMethod(subscriptionId: string, token: string) {
  const sub = await fetchSubscriptionOrThrow(subscriptionId);
  const provider = providerOf(sub);

  let cardBrand: string | null = null;
  let cardLastFour: string | null = null;

  if (provider === 'pagarme') {
    const updated = await pagarme.updateSubscriptionCard(sub.provider_id, token);
    cardBrand = updated.card?.brand ?? null;
    cardLastFour = updated.card?.last_four_digits ?? null;
  } else {
    const stripe = getStripe();
    const stripeSubscription = await stripe.subscriptions.retrieve(sub.provider_id);
    const customerId = stripeSubscription.customer as string;

    await stripe.paymentMethods.attach(token, { customer: customerId });
    await stripe.subscriptions.update(sub.provider_id, { default_payment_method: token });

    const pm = await stripe.paymentMethods.retrieve(token);
    cardLastFour = pm.card?.last4 ?? null;
    cardBrand = pm.card?.brand ?? null;
  }

  await query(
    `UPDATE subscriptions SET card_last_four = $2, card_brand = $3 WHERE id = $1`,
    [subscriptionId, cardLastFour, cardBrand],
  );

  // Audit (non-blocking). The token itself is never logged: it is single-use,
  // but it is still a card credential.
  auditLog('subscription.payment_method_updated', sub.member_id, {
    subscriptionId,
    provider,
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
