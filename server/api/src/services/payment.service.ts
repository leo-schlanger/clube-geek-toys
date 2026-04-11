import { query } from '../config/database.js';
import { env } from '../config/env.js';
import { pagbankRequest, mapPagBankStatus } from '../utils/pagbank.js';
import type { PagBankOrder } from '../utils/pagbank.js';
import { AppError } from '../middleware/error-handler.js';
import { PLAN_PRICES } from '../types/index.js';
import { auditLog } from '../utils/audit.js';
import crypto from 'crypto';

const MIN_AMOUNT = 1.00;
const MAX_AMOUNT = 999.90;

function validateAmount(amount: number) {
  if (amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
    throw new AppError(
      400,
      `Valor deve estar entre R$${MIN_AMOUNT.toFixed(2)} e R$${MAX_AMOUNT.toFixed(2)}`,
      'AMOUNT_OUT_OF_RANGE',
    );
  }
  // Cross-check: amount should match one of the plan prices
  // (allow for upgrade prorated charges by tolerating any cents within the valid range)
  const validPrices: number[] = Object.values(PLAN_PRICES).flatMap((p) => [p.monthly, p.annual]);
  const matchesPrice = validPrices.some((p) => Math.abs(p - amount) < 0.01);
  // For non-plan amounts (e.g., upgrade prorated), only validate range; explicit plan validation
  // happens at the route layer for renewal/initial flows.
  if (!matchesPrice && amount > MAX_AMOUNT) {
    throw new AppError(400, `Valor inválido: R$${amount.toFixed(2)}`, 'INVALID_AMOUNT');
  }
}

/**
 * Validates a PagBank encrypted card token. Tokens are base64-ish strings of substantial length
 * generated client-side by the PagBank JS SDK. Reject early to avoid wasted PagBank API calls
 * and to block dev mock tokens (`dev_enc_*`) from leaking into production.
 */
function validateEncryptedCardToken(token: string): void {
  if (!token || typeof token !== 'string') {
    throw new AppError(400, 'Token de cartão ausente ou inválido.', 'INVALID_CARD_TOKEN');
  }
  if (token.startsWith('dev_enc_') || token.startsWith('mock_')) {
    throw new AppError(400, 'Token de cartão de teste rejeitado.', 'DEV_TOKEN_REJECTED');
  }
  // PagBank tokens are typically >100 chars; allow URL-safe base64 plus common variants.
  if (token.length < 100 || !/^[A-Za-z0-9+/=_\-.:]+$/.test(token)) {
    throw new AppError(400, 'Formato do token de cartão inválido.', 'INVALID_CARD_TOKEN_FORMAT');
  }
}

/**
 * Returns a recent PAID payment for this member within the duplicate-prevention window.
 * Used to block accidental double-charges (member clicks "renew" twice in quick succession).
 *
 * Window default 7 days — covers the typical "I'll just retry" flow without blocking legitimate
 * partial-month renewals (which are very rare).
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
 *
 * Example: monthly Silver paid 01/04, today is 15/04, upgrading to Gold:
 *   daysRemaining = 16 (until 01/05)
 *   periodDays    = 30
 *   creditValue   = (16/30) * silverMonthlyPrice
 *   newCharge     = goldMonthlyPrice - creditValue
 *
 * Floor at 0 — never refund money via the upgrade flow (use refund endpoint instead).
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

export async function createPixPayment(data: {
  amount: number;
  description: string;
  payer_email: string;
  external_reference: string;
}) {
  validateAmount(data.amount);
  const referenceId = crypto.randomUUID();

  const order = await pagbankRequest<PagBankOrder>({
    method: 'POST',
    path: '/orders',
    body: {
      reference_id: data.external_reference,
      customer: {
        name: 'Cliente',
        email: data.payer_email,
      },
      items: [
        {
          reference_id: referenceId,
          name: data.description,
          quantity: 1,
          unit_amount: Math.round(data.amount * 100), // PagBank uses cents
        },
      ],
      qr_codes: [
        {
          amount: {
            value: Math.round(data.amount * 100),
          },
          expiration_date: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
        },
      ],
      notification_urls: [`${env.API_URL}/webhook/pagbank`],
    },
  });

  const qrCode = order.qr_codes?.[0];
  const qrCodeText = qrCode?.links?.find((l) => l.media === 'text/plain')?.href || '';
  const qrCodeImage = qrCode?.links?.find((l) => l.media === 'image/png')?.href || '';

  // Save payment to database
  await query(
    `INSERT INTO payments (member_id, amount, method, status, provider_id, provider_status, reference)
     VALUES ((SELECT id FROM members WHERE id = $1 LIMIT 1), $2, 'pix', 'pending', $3, $4, $5)`,
    [
      data.external_reference,
      data.amount,
      order.id,
      order.charges?.[0]?.status || 'WAITING',
      data.external_reference,
    ]
  );

  return {
    id: order.id,
    status: 'pending',
    qr_code: qrCodeText,
    qr_code_base64: '', // PagBank provides image URL instead
    qr_code_image_url: qrCodeImage,
    ticket_url: qrCodeImage,
  };
}

export async function createCardPayment(data: {
  amount: number;
  description: string;
  payer_email: string;
  payer_name: string;
  encrypted_card: string;
  external_reference: string;
  installments?: number;
}) {
  validateAmount(data.amount);
  validateEncryptedCardToken(data.encrypted_card);
  const order = await pagbankRequest<PagBankOrder>({
    method: 'POST',
    path: '/orders',
    body: {
      reference_id: data.external_reference,
      customer: {
        name: data.payer_name,
        email: data.payer_email,
      },
      items: [
        {
          reference_id: crypto.randomUUID(),
          name: data.description,
          quantity: 1,
          unit_amount: Math.round(data.amount * 100),
        },
      ],
      charges: [
        {
          reference_id: crypto.randomUUID(),
          description: data.description,
          amount: {
            value: Math.round(data.amount * 100),
            currency: 'BRL',
          },
          payment_method: {
            type: 'CREDIT_CARD',
            installments: data.installments || 1,
            capture: true,
            card: {
              encrypted: data.encrypted_card,
            },
          },
        },
      ],
      notification_urls: [`${env.API_URL}/webhook/pagbank`],
    },
  });

  const charge = order.charges?.[0];
  const status = mapPagBankStatus(charge?.status || '');

  // Save payment to database
  await query(
    `INSERT INTO payments (member_id, amount, method, status, provider_id, provider_status, reference)
     VALUES ((SELECT id FROM members WHERE id = $1 LIMIT 1), $2, 'credit_card', $3, $4, $5, $6)`,
    [
      data.external_reference,
      data.amount,
      status,
      order.id,
      charge?.status || 'WAITING',
      data.external_reference,
    ]
  );

  return {
    id: order.id,
    status,
    charge_id: charge?.id,
    provider_status: charge?.status,
  };
}

export async function getPaymentStatus(orderId: string) {
  const order = await pagbankRequest<PagBankOrder>({
    method: 'GET',
    path: `/orders/${orderId}`,
  });

  const charge = order.charges?.[0];
  const qrCode = order.qr_codes?.[0];
  const status = charge
    ? mapPagBankStatus(charge.status)
    : (qrCode?.status === 'PAID' ? 'paid' : 'pending');

  return {
    id: order.id,
    status: charge?.status || qrCode?.status || 'WAITING',
    mapped_status: status,
    external_reference: order.reference_id,
    transaction_amount: (charge?.amount?.value || qrCode?.amount?.value || 0) / 100,
    date_approved: charge?.paid_at || null,
    payment_method_id: charge?.payment_method?.type || 'pix',
  };
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

/**
 * Refund a paid payment via PagBank API and reflect the change in our DB.
 *
 * Behavior:
 * - Calls PagBank to cancel/refund the charge
 * - Updates payments.status to 'refunded'
 * - Writes audit_log entry
 * - Member status remains 'active' until expiry; admin may manually deactivate if needed
 *   (we don't auto-deactivate to avoid surprising the customer in partial-refund scenarios)
 *
 * Idempotent: a payment already 'refunded' returns the existing record without re-calling PagBank.
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

  // Call PagBank charge cancel/refund API
  // PagBank: POST /charges/{id}/cancel for PAID charges
  try {
    await pagbankRequest({
      method: 'POST',
      path: `/charges/${payment.providerId}/cancel`,
      body: {
        amount: { value: Math.round(payment.amount * 100) },
      },
    });
  } catch (err) {
    console.error('[REFUND] PagBank refund call failed:', err);
    throw new AppError(
      502,
      'Falha ao solicitar reembolso na operadora. Tente novamente em alguns minutos.',
      'PAGBANK_REFUND_FAILED',
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
