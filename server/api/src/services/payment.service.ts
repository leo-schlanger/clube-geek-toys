import { query } from '../config/database.js';
import { env } from '../config/env.js';
import { getStripe, getOrCreateCustomer, mapStripePaymentStatus } from '../utils/stripe.js';
import { generatePixEMV, generatePixTxId, type PixQRData } from '../utils/pix.js';
import { sendTemplateEmail } from './email.service.js';
import { AppError } from '../middleware/error-handler.js';
import { PLAN_PRICES } from '../types/index.js';
import { auditLog } from '../utils/audit.js';
import crypto from 'crypto';

const PIX_KEY = env.PIX_KEY || '';
const PIX_MERCHANT_NAME = env.PIX_MERCHANT_NAME || 'GEEK E TOYS';
const PIX_MERCHANT_CITY = env.PIX_MERCHANT_CITY || 'RIO DE JANEIRO';

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
  if (!matchesPrice) {
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
/**
 * PIX payment — generated locally (not via Stripe, since Stripe PIX isn't available).
 *
 * Flow:
 * 1. Generate EMV code with the club's PIX key + amount + txId
 * 2. Save pending payment in DB
 * 3. Notify admin via email that there's a PIX payment to confirm
 * 4. Return QR data to frontend (EMV code for rendering)
 * 5. Admin confirms manually via POST /payments/:id/confirm
 */
export async function createPixPayment(data: {
  amount: number;
  description: string;
  payerEmail: string;
  memberId: string;
}): Promise<{
  paymentId: string;
  pixData: PixQRData;
}> {
  if (!PIX_KEY) {
    throw new AppError(503, 'Pagamento PIX não está configurado.', 'PIX_NOT_CONFIGURED');
  }
  validateAmount(data.amount);

  const memberResult = await query(
    'SELECT id, email, full_name, plan FROM members WHERE id = $1',
    [data.memberId]
  );
  if (memberResult.rows.length === 0) {
    throw new AppError(404, 'Membro não encontrado.', 'MEMBER_NOT_FOUND');
  }
  const member = memberResult.rows[0];

  // Generate PIX EMV code locally
  const txId = generatePixTxId();
  const pixData = generatePixEMV({
    pixKey: PIX_KEY,
    amount: data.amount,
    merchantName: PIX_MERCHANT_NAME,
    merchantCity: PIX_MERCHANT_CITY,
    txId,
  });

  // Save pending payment
  const paymentId = crypto.randomUUID();
  await query(
    `INSERT INTO payments (id, member_id, amount, method, status, provider_id, provider_status, reference)
     VALUES ($1, $2, $3, 'pix', 'pending', $4, 'PIX_PENDING', $5)`,
    [paymentId, data.memberId, data.amount, txId, txId]
  );

  await auditLog('payment.pix_created', null, {
    paymentId,
    memberId: data.memberId,
    amount: data.amount,
    txId,
  }, data.memberId);

  // Notify admin via email (non-blocking)
  sendTemplateEmail({
    template: 'admin-pix-pending',
    to: env.ADMIN_EMAIL,
    variables: {
      member_name: member.full_name as string,
      member_email: member.email as string,
      plan: member.plan as string,
      amount: data.amount.toFixed(2).replace('.', ','),
      tx_id: txId,
      payment_id: paymentId,
      admin_url: `${env.FRONTEND_URL.replace('club.', 'admin.')}/admin?tab=members`,
    },
    member_id: data.memberId,
  }).catch((err) => console.error('[PIX] Failed to notify admin:', err));

  return { paymentId, pixData };
}

/**
 * Admin manually confirms a PIX payment.
 * Sets payment status to 'paid' and activates the member.
 */
export async function confirmPixPayment(opts: {
  paymentId: string;
  adminUserId: string;
}): Promise<{ success: boolean }> {
  const payment = await getPaymentById(opts.paymentId);
  if (!payment) {
    throw new AppError(404, 'Pagamento não encontrado.', 'PAYMENT_NOT_FOUND');
  }
  if (payment.status === 'paid') {
    return { success: true }; // idempotent
  }
  if (payment.method !== 'pix') {
    throw new AppError(400, 'Apenas pagamentos PIX podem ser confirmados manualmente.', 'NOT_PIX_PAYMENT');
  }

  // Mark payment as paid
  await query(
    `UPDATE payments SET status = 'paid', paid_at = NOW(), webhook_processed_at = NOW() WHERE id = $1`,
    [opts.paymentId]
  );

  // Activate or renew member
  if (payment.memberId) {
    const memberLookup = await query(
      'SELECT id, payment_type, status, expiry_date FROM members WHERE id = $1',
      [payment.memberId]
    );
    if (memberLookup.rows.length > 0) {
      const member = memberLookup.rows[0];
      const now = new Date();

      // For renewals: extend from the current expiry date (not today), so the member
      // doesn't lose remaining days. For new activations: start from today.
      const currentExpiry = member.expiry_date ? new Date(member.expiry_date) : null;
      const isRenewal = member.status === 'active' && currentExpiry && currentExpiry > now;
      const baseDate = isRenewal ? currentExpiry : now;

      const expiryDate = new Date(baseDate);
      if (member.payment_type === 'annual') {
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);
      } else {
        expiryDate.setMonth(expiryDate.getMonth() + 1);
      }

      await query(
        `UPDATE members SET status = 'active', start_date = COALESCE(start_date, $1), expiry_date = $2,
         activated_at = COALESCE(activated_at, NOW()), activated_by_payment = $3, pending_payment = NULL,
         auto_renewal = FALSE
         WHERE id = $4`,
        [
          now.toISOString().split('T')[0],
          expiryDate.toISOString().split('T')[0],
          opts.paymentId,
          payment.memberId,
        ]
      );

      // Send confirmation + welcome emails to member
      const memberData = await query(
        'SELECT full_name, email, plan FROM members WHERE id = $1',
        [payment.memberId]
      );
      if (memberData.rows.length > 0) {
        const m = memberData.rows[0];
        sendTemplateEmail({
          template: 'payment-confirmed',
          to: m.email as string,
          variables: {
            name: m.full_name as string,
            amount: payment.amount.toFixed(2).replace('.', ','),
            plan: m.plan as string,
            expiry_date: expiryDate.toLocaleDateString('pt-BR'),
          },
          member_id: payment.memberId as string,
        }).catch((err: unknown) => console.error('[PIX] Confirmation email error:', err));

        // Welcome email on first activation
        if (member.status !== 'active') {
          sendTemplateEmail({
            template: 'welcome',
            to: m.email as string,
            variables: { name: m.full_name as string, plan: m.plan as string },
            member_id: payment.memberId as string,
          }).catch((err: unknown) => console.error('[PIX] Welcome email error:', err));
        }
      }
    }
  }

  await auditLog('payment.pix_confirmed', opts.adminUserId, {
    paymentId: opts.paymentId,
    memberId: payment.memberId,
    amount: payment.amount,
  }, payment.memberId as string);

  return { success: true };
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
 * Retrieve payment status.
 *
 * For Stripe PaymentIntents (IDs starting with "pi_"), queries Stripe API.
 * For local payments (PIX — UUID format), queries our payments table directly.
 * This is critical because PIX QR codes are generated locally, not via Stripe,
 * so the frontend polling needs a DB-based status check.
 */
export async function getPaymentStatus(paymentId: string): Promise<{
  id: string;
  status: string;
  mapped_status: string;
  amount: number;
  currency: string;
  paymentMethod: string | null;
}> {
  // Stripe PaymentIntent IDs always start with "pi_"
  if (paymentId.startsWith('pi_')) {
    const stripe = getStripe();
    const pi = await stripe.paymentIntents.retrieve(paymentId);
    return {
      id: pi.id,
      status: pi.status,
      mapped_status: mapStripePaymentStatus(pi.status),
      amount: pi.amount / 100,
      currency: pi.currency,
      paymentMethod: pi.payment_method_types?.[0] || null,
    };
  }

  // Local payment (PIX) — check our database
  const result = await query(
    `SELECT id, amount, status, method FROM payments WHERE id = $1`,
    [paymentId]
  );

  if (result.rows.length === 0) {
    throw new AppError(404, 'Pagamento não encontrado.', 'PAYMENT_NOT_FOUND');
  }

  const row = result.rows[0];
  return {
    id: row.id,
    status: row.status,
    mapped_status: row.status, // already in our internal format
    amount: parseFloat(row.amount),
    currency: 'brl',
    paymentMethod: row.method || null,
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
    const stripeReasonMap: Record<string, 'duplicate' | 'fraudulent' | 'requested_by_customer'> = {
      duplicate: 'duplicate',
      fraudulent: 'fraudulent',
    };
    await stripe.refunds.create({
      payment_intent: payment.providerId as string,
      reason: stripeReasonMap[opts.reason || ''] || 'requested_by_customer',
    });
  } catch (err) {
    console.error('[REFUND] Stripe refund call failed:', err);
    throw new AppError(
      502,
      'Falha ao solicitar reembolso na operadora. Tente novamente em alguns minutos.',
      'STRIPE_REFUND_FAILED',
    );
  }

  // Mark as refunded in DB (store reason for audit trail)
  await query(
    `UPDATE payments SET status = 'refunded', refund_reason = $2, updated_at = NOW() WHERE id = $1`,
    [opts.paymentId, opts.reason || null]
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
