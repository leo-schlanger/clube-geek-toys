import { query } from '../config/database.js';
import { getStripe, getOrCreateCustomer, mapStripePaymentStatus } from '../utils/stripe.js';
import { AppError } from '../middleware/error-handler.js';
import { PLAN_PRICES } from '../types/index.js';
import { auditLog } from '../utils/audit.js';

const MIN_AMOUNT = 1.00;
const MAX_AMOUNT = 999.90;

function validateAmount(amount: number): void {
  if (amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
    throw new AppError(
      400,
      `Valor deve estar entre R$${MIN_AMOUNT.toFixed(2)} e R$${MAX_AMOUNT.toFixed(2)}`,
      'AMOUNT_OUT_OF_RANGE',
    );
  }
  const validPrices: number[] = Object.values(PLAN_PRICES).flatMap((p) => [p.monthly, p.annual]);
  const matchesPrice = validPrices.some((p) => Math.abs(p - amount) < 0.01);
  if (!matchesPrice && amount > MAX_AMOUNT) {
    throw new AppError(400, `Valor inválido: R$${amount.toFixed(2)}`, 'INVALID_AMOUNT');
  }
}

// ─── Row mapper ──────────────────────────────────────────────────────────────

function mapPaymentRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    memberId: row.member_id,
    memberName: row.member_name || null,
    amount: parseFloat(row.amount as string),
    method: row.method,
    status: row.status,
    providerId: row.provider_id,
    providerStatus: row.provider_status,
    reference: row.reference,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  };
}

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * Returns a recent PAID payment for this member within the duplicate-prevention window.
 * Used to block accidental double-charges (member clicks "renew" twice in quick succession).
 */
export async function findRecentPayment(memberId: string, withinDays = 7) {
  const result = await query(
    `SELECT id, amount, status, paid_at, created_at
     FROM payments
     WHERE member_id = $1
       AND status = 'paid'
       AND created_at > NOW() - ($2::int * INTERVAL '1 day')
     ORDER BY created_at DESC
     LIMIT 1`,
    [memberId, withinDays]
  );
  return result.rows[0] || null;
}

/**
 * Computes prorated charge for an upgrade. Credits the member for unused days on their current plan.
 */
export function calculateUpgradeCharge(opts: {
  currentPlanPrice: number;
  newPlanPrice: number;
  expiryDate: Date;
  paymentType: 'monthly' | 'annual';
  now?: Date;
}): { charge: number; credit: number; daysRemaining: number; periodDays: number } {
  const now = opts.now ?? new Date();
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysRemaining = Math.max(0, Math.floor((opts.expiryDate.getTime() - now.getTime()) / msPerDay));
  const periodDays = opts.paymentType === 'annual' ? 365 : 30;
  const dailyRate = opts.currentPlanPrice / periodDays;
  const credit = Math.min(opts.currentPlanPrice, dailyRate * daysRemaining);
  const charge = Math.max(0, opts.newPlanPrice - credit);
  return {
    charge: Math.round(charge * 100) / 100,
    credit: Math.round(credit * 100) / 100,
    daysRemaining,
    periodDays,
  };
}

export async function getPayments(filters: { memberId?: string; status?: string; limit?: number }) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.memberId) {
    conditions.push(`p.member_id = $${paramIndex++}`);
    params.push(filters.memberId);
  }
  if (filters.status) {
    conditions.push(`p.status = $${paramIndex++}`);
    params.push(filters.status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(filters.limit || 20, 100);

  const result = await query(
    `SELECT p.*, m.full_name as member_name
     FROM payments p
     LEFT JOIN members m ON m.id = p.member_id
     ${where}
     ORDER BY p.created_at DESC
     LIMIT $${paramIndex}`,
    [...params, limit]
  );

  return result.rows.map(mapPaymentRow);
}

/**
 * Lookup payment by primary key, with member info attached.
 */
export async function getPaymentById(id: string) {
  const result = await query(
    `SELECT p.*, m.full_name as member_name, m.email as member_email
     FROM payments p
     LEFT JOIN members m ON m.id = p.member_id
     WHERE p.id = $1`,
    [id]
  );
  if (result.rows.length === 0) return null;
  return mapPaymentRow(result.rows[0]);
}

// ─── Stripe PaymentIntent: PIX ───────────────────────────────────────────────

/**
 * Create a Stripe PaymentIntent for PIX and persist a pending payment row.
 *
 * Returns the client secret (for the frontend to confirm) and any PIX QR code data
 * available immediately. If no QR code is returned yet, the frontend should poll
 * via getPaymentStatus().
 */
export async function createPixPayment(data: {
  amount: number;
  description: string;
  payerEmail: string;
  memberId: string;
}): Promise<{
  clientSecret: string;
  paymentIntentId: string;
  pix: { data: string; imageUrl: string; expiresAt: number } | null;
}> {
  validateAmount(data.amount);

  // Ensure Stripe Customer exists for the member
  const memberResult = await query(
    'SELECT id, email, full_name, stripe_customer_id FROM members WHERE id = $1',
    [data.memberId]
  );
  if (memberResult.rows.length === 0) {
    throw new AppError(404, 'Membro não encontrado.', 'MEMBER_NOT_FOUND');
  }
  const member = memberResult.rows[0];
  const customerId = await getOrCreateCustomer({
    id: member.id as string,
    email: (member.email as string) || data.payerEmail,
    fullName: member.full_name as string,
    stripeCustomerId: member.stripe_customer_id as string | null,
  });

  const stripe = getStripe();
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(data.amount * 100), // Stripe uses cents
    currency: 'brl',
    payment_method_types: ['pix'],
    customer: customerId,
    description: data.description,
    metadata: { memberId: data.memberId },
  });

  // Persist pending payment row
  await query(
    `INSERT INTO payments (member_id, amount, method, status, provider_id, provider_status, reference)
     VALUES ($1, $2, 'pix', 'pending', $3, $4, $5)`,
    [
      data.memberId,
      data.amount,
      paymentIntent.id,
      paymentIntent.status,
      paymentIntent.id,
    ]
  );

  // Extract PIX QR code data if available immediately
  const pixAction = paymentIntent.next_action?.pix_display_qr_code;
  const pix = pixAction
    ? {
        data: pixAction.data ?? '',
        imageUrl: pixAction.image_url_png ?? '',
        expiresAt: pixAction.expires_at ?? 0,
      }
    : null;

  return {
    clientSecret: paymentIntent.client_secret!,
    paymentIntentId: paymentIntent.id,
    pix,
  };
}

// ─── Stripe PaymentIntent: Card ──────────────────────────────────────────────

/**
 * Create a Stripe PaymentIntent for card payment and persist a pending payment row.
 *
 * The frontend uses the clientSecret with Stripe.js `confirmCardPayment()` to collect
 * and confirm the card details securely — no raw card data ever touches our server.
 */
export async function createCardPayment(data: {
  amount: number;
  description: string;
  payerEmail: string;
  payerName: string;
  memberId: string;
}): Promise<{
  clientSecret: string;
  paymentIntentId: string;
}> {
  validateAmount(data.amount);

  // Ensure Stripe Customer exists for the member
  const memberResult = await query(
    'SELECT id, email, full_name, stripe_customer_id FROM members WHERE id = $1',
    [data.memberId]
  );
  if (memberResult.rows.length === 0) {
    throw new AppError(404, 'Membro não encontrado.', 'MEMBER_NOT_FOUND');
  }
  const member = memberResult.rows[0];
  const customerId = await getOrCreateCustomer({
    id: member.id as string,
    email: (member.email as string) || data.payerEmail,
    fullName: (member.full_name as string) || data.payerName,
    stripeCustomerId: member.stripe_customer_id as string | null,
  });

  const stripe = getStripe();
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(data.amount * 100), // Stripe uses cents
    currency: 'brl',
    payment_method_types: ['card'],
    customer: customerId,
    description: data.description,
    metadata: { memberId: data.memberId },
  });

  // Persist pending payment row
  await query(
    `INSERT INTO payments (member_id, amount, method, status, provider_id, provider_status, reference)
     VALUES ($1, $2, 'credit_card', 'pending', $3, $4, $5)`,
    [
      data.memberId,
      data.amount,
      paymentIntent.id,
      paymentIntent.status,
      paymentIntent.id,
    ]
  );

  return {
    clientSecret: paymentIntent.client_secret!,
    paymentIntentId: paymentIntent.id,
  };
}

// ─── Payment status ──────────────────────────────────────────────────────────

/**
 * Retrieve a PaymentIntent from Stripe and return mapped status info.
 */
export async function getPaymentStatus(paymentIntentId: string): Promise<{
  id: string;
  status: string;
  mapped_status: string;
  amount: number;
  currency: string;
  paymentMethod: string | null;
}> {
  const stripe = getStripe();
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

  return {
    id: pi.id,
    status: pi.status,
    mapped_status: mapStripePaymentStatus(pi.status),
    amount: pi.amount / 100,
    currency: pi.currency,
    paymentMethod: pi.payment_method_types?.[0] || null,
  };
}

// ─── Refund ──────────────────────────────────────────────────────────────────

/**
 * Refund a paid payment via Stripe and reflect the change in our DB.
 *
 * Behavior:
 * - Calls stripe.refunds.create() to refund the PaymentIntent
 * - Updates payments.status to 'refunded'
 * - Writes audit_log entry
 * - Member status remains 'active' until expiry; admin may manually deactivate if needed
 *
 * Idempotent: a payment already 'refunded' returns the existing record without re-calling Stripe.
 */
export async function refundPayment(opts: {
  paymentId: string;
  adminUserId: string;
  reason?: string;
}) {
  const payment = await getPaymentById(opts.paymentId);
  if (!payment) {
    throw new AppError(404, 'Pagamento não encontrado', 'PAYMENT_NOT_FOUND');
  }
  if (payment.status === 'refunded') {
    return { ...payment, alreadyRefunded: true };
  }
  if (payment.status !== 'paid') {
    throw new AppError(
      400,
      `Apenas pagamentos pagos podem ser reembolsados (status atual: ${payment.status}).`,
      'PAYMENT_NOT_REFUNDABLE',
    );
  }
  if (!payment.providerId) {
    throw new AppError(400, 'Pagamento sem referência de provedor.', 'PAYMENT_NO_PROVIDER_ID');
  }

  // Refund via Stripe
  try {
    const stripe = getStripe();
    await stripe.refunds.create({
      payment_intent: payment.providerId as string,
      reason: opts.reason ? 'requested_by_customer' : undefined,
    });
  } catch (err) {
    console.error('[REFUND] Stripe refund call failed:', err);
    throw new AppError(
      502,
      'Falha ao solicitar reembolso na operadora. Tente novamente em alguns minutos.',
      'STRIPE_REFUND_FAILED',
    );
  }

  // Mark as refunded in DB
  await query(
    `UPDATE payments SET status = 'refunded', updated_at = NOW() WHERE id = $1`,
    [opts.paymentId]
  );

  await auditLog(
    'payment.refunded',
    opts.adminUserId,
    {
      paymentId: opts.paymentId,
      amount: payment.amount,
      providerId: payment.providerId,
      reason: opts.reason || null,
    },
    payment.memberId as string,
  );

  return { ...payment, status: 'refunded' as const };
}
