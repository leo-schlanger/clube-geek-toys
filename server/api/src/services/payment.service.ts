import { query } from '../config/database.js';
import { env } from '../config/env.js';
import { getStripe, mapStripePaymentStatus } from '../utils/stripe.js';
import { type PixQRData } from '../utils/pix.js';
import * as pagarme from '../utils/pagarme.js';
import { sendTemplateEmail } from './email.service.js';
import { notifyAdminsOfPaymentAsync } from './admin-notification.service.js';
import { AppError } from '../middleware/error-handler.js';
import { isValidCPF } from '../utils/cpf.js';
import { isValidCnpj } from '../utils/cnpj.js';
import { CLUB_PLAN_PRICE } from '../types/index.js';
import { auditLog } from '../utils/audit.js';
import crypto from 'crypto';

const MIN_AMOUNT = 1.00;
/** Generous ceiling so admin and shop never hit an artificial low limit. */
const MAX_AMOUNT = 999_999.99;

function validateAmount(amount: number): void {
  if (amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
    throw new AppError(
      400,
      `Valor deve estar entre R$${MIN_AMOUNT.toFixed(2)} e R$${MAX_AMOUNT.toFixed(2)}`,
      'AMOUNT_OUT_OF_RANGE',
    );
  }
  const matchesPrice = Math.abs(CLUB_PLAN_PRICE - amount) < 0.01;
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

// ─── Club membership: the member behind a payment ────────────────────────────

interface ClubPayer {
  id: string;
  email: string;
  fullName: string;
  plan: string;
  document: string;
  phone: string | null;
  pagarmeCustomerId: string | null;
}

/**
 * Load the member and the fields Pagar.me insists on.
 *
 * The document is not optional at the provider: a PSP order without a valid
 * CPF/CNPJ is a 422, so it is better to fail here with a sentence the member
 * can act on than to surface a field-path error from the acquirer.
 */
async function loadClubPayer(memberId: string): Promise<ClubPayer> {
  const result = await query(
    `SELECT id, email, full_name, plan, cpf, phone, pagarme_customer_id
       FROM members WHERE id = $1`,
    [memberId],
  );
  if (result.rows.length === 0) {
    throw new AppError(404, 'Membro não encontrado.', 'MEMBER_NOT_FOUND');
  }
  const row = result.rows[0];
  const document = pagarme.normalizeDocument(row.cpf as string);
  // Check digits, not just length. Registration validates the CPF, but rows
  // predate that check and a placeholder like 111.111.111-11 has the right
  // length — the acquirer would reject it with a field-path 422 the member
  // cannot act on, several steps later.
  const documentIsValid =
    document.length === 11 ? isValidCPF(document) : document.length === 14 && isValidCnpj(document);
  if (!documentIsValid) {
    throw new AppError(
      400,
      'Cadastro sem CPF válido. Atualize seus dados antes de pagar.',
      'MEMBER_DOCUMENT_MISSING',
    );
  }
  return {
    id: row.id as string,
    email: row.email as string,
    fullName: row.full_name as string,
    plan: row.plan as string,
    document,
    phone: (row.phone as string) ?? null,
    pagarmeCustomerId: (row.pagarme_customer_id as string) ?? null,
  };
}

/** The customer block Pagar.me wants, built from a member row. */
function payerToPagarmeCustomer(payer: ClubPayer): pagarme.PagarmeCustomerInput {
  const phone = pagarme.parseBrazilianPhone(payer.phone);
  return {
    name: payer.fullName,
    email: payer.email,
    document: payer.document,
    code: payer.id,
    phones: phone ? { mobile_phone: phone } : undefined,
    metadata: { memberId: payer.id },
  };
}

/** Pull the PIX transaction out of a created order, or explain why there isn't one. */
function requirePixTransaction(order: pagarme.PagarmeOrder): {
  charge: pagarme.PagarmeCharge;
  qrCode: string;
  qrCodeUrl: string;
  expiresAt: string;
} {
  const charge = order.charges?.[0];
  const tx = charge?.last_transaction;
  if (!charge || !tx?.qr_code) {
    console.error('[PIX] Pagar.me order without qr_code:', JSON.stringify(order).slice(0, 800));
    throw new AppError(
      502,
      'Não foi possível gerar o QR Code PIX agora. Tente novamente em instantes.',
      'PIX_QRCODE_UNAVAILABLE',
    );
  }
  return {
    charge,
    qrCode: tx.qr_code,
    qrCodeUrl: tx.qr_code_url ?? '',
    expiresAt:
      tx.expires_at ??
      new Date(Date.now() + env.PAGARME_PIX_EXPIRES_IN * 1000).toISOString(),
  };
}

// ─── Pagar.me: PIX ───────────────────────────────────────────────────────────

/**
 * PIX for the club plan, issued by Pagar.me.
 *
 * This replaces the locally generated static BR Code. The difference that
 * matters is not the QR itself but who watches it: Pagar.me reconciles the
 * payment and fires `charge.paid`, so the member is activated automatically.
 * Before, every PIX sat `pending` until an admin compared it against the bank
 * statement and clicked confirm — the single most common way a paying member
 * stayed locked out over a weekend.
 *
 * `confirmPixPayment` survives as the manual override for the codes issued
 * under the old flow, and for the rare case where the webhook never lands.
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
  validateAmount(data.amount);
  const payer = await loadClubPayer(data.memberId);
  const amountInCents = pagarme.toCents(data.amount);

  const paymentId = crypto.randomUUID();
  const order = await pagarme.createOrder(
    {
      code: paymentId,
      customer: payerToPagarmeCustomer(payer),
      items: [
        {
          amount: amountInCents,
          description: data.description.slice(0, 255),
          quantity: 1,
          code: `club-${payer.plan}`,
        },
      ],
      payments: [
        {
          payment_method: 'pix',
          pix: {
            expires_in: env.PAGARME_PIX_EXPIRES_IN,
            additional_information: [
              { name: 'Plano', value: payer.plan },
              { name: 'Membro', value: payer.fullName.slice(0, 60) },
            ],
          },
        },
      ],
      metadata: { kind: 'club_membership', memberId: payer.id, paymentId },
    },
    // Keyed on the payment row we are about to write, so a retried request
    // after a timeout returns the same QR instead of opening a second charge.
    { idempotencyKey: pagarme.idempotencyKeyFor('club_pix', paymentId, amountInCents) },
  );

  const { charge, qrCode, qrCodeUrl, expiresAt } = requirePixTransaction(order);

  await query(
    `INSERT INTO payments
       (id, member_id, amount, method, status, provider, provider_id, provider_status,
        reference, pagarme_order_id, pagarme_charge_id)
     VALUES ($1, $2, $3, 'pix', 'pending', 'pagarme', $4, $5, $6, $7, $4)`,
    [paymentId, payer.id, data.amount, charge.id, charge.status, order.id, order.id],
  );

  await auditLog(
    'payment.pix_created',
    null,
    {
      paymentId,
      memberId: payer.id,
      amount: data.amount,
      provider: 'pagarme',
      pagarmeOrderId: order.id,
      pagarmeChargeId: charge.id,
    },
    payer.id,
  );

  notifyAdminsOfPaymentAsync({
    event: 'payment_pending',
    subject: `Assinatura — ${payer.fullName}`,
    amount: data.amount,
    method: 'pix',
    customerName: payer.fullName,
    customerEmail: payer.email,
    link: '/admin?tab=members',
    detail: 'PIX gerado. A Pagar.me confirma sozinha quando o pagamento cair.',
    chargeId: charge.id,
  });

  return {
    paymentId,
    pixData: {
      emvCode: qrCode,
      qrCodeUrl,
      pixKey: env.PIX_KEY || '',
      amount: data.amount,
      txId: charge.id,
      expiresAt,
      provider: 'pagarme',
    },
  };
}

/**
 * Admin settles a PIX by hand.
 *
 * With Pagar.me issuing the QR this is no longer the normal path — the webhook
 * marks the charge paid on its own, usually within seconds. It survives for two
 * cases: the static codes generated before the migration, which nothing watches,
 * and the rare charge whose webhook never lands.
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

  // Claim the payment: the read above is not a guard, it is a hint. Two clicks
  // in the panel (or two admins) both read `pending`, both passed, and the
  // member got `payment_count + 1` twice and **two months** of validity for one
  // payment — the expiry is computed from the row this function already read.
  // Only the writer that actually flips the row proceeds.
  const claimed = await query(
    `UPDATE payments SET status = 'paid', paid_at = NOW(), webhook_processed_at = NOW()
      WHERE id = $1 AND status <> 'paid'
      RETURNING id`,
    [opts.paymentId]
  );
  if (claimed.rows.length === 0) {
    return { success: true }; // another writer got there first
  }

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

      // New charges are monthly even if the member originally paid a year.
      const expiryDate = new Date(baseDate);
      expiryDate.setMonth(expiryDate.getMonth() + 1);

      await query(
        `UPDATE members SET status = 'active', start_date = COALESCE(start_date, $1), expiry_date = $2,
         activated_at = COALESCE(activated_at, NOW()), activated_by_payment = $3, pending_payment = NULL,
         auto_renewal = FALSE, payment_count = payment_count + 1, payment_type = 'monthly'
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
    manual: true,
  }, payment.memberId as string);

  notifyAdminsOfPaymentAsync({
    event: 'payment_received',
    subject: `Assinatura — ${(payment.memberName as string) || 'membro'}`,
    amount: payment.amount,
    method: 'pix',
    customerName: (payment.memberName as string) ?? null,
    link: '/admin?tab=members',
    detail: 'Confirmado manualmente no painel.',
    chargeId: (payment.providerId as string) ?? null,
  });

  return { success: true };
}

// ─── Pagar.me: card ──────────────────────────────────────────────────────────

/**
 * Charge a card for the club plan.
 *
 * The shape of this flow changed with the migration. Stripe handed the browser
 * a `clientSecret` and the browser finished the payment; Pagar.me authorises
 * synchronously, so by the time this returns the charge is already approved or
 * already declined. The caller gets the outcome, not a secret to redeem.
 *
 * Raw card data never reaches this server: the browser exchanges it for a
 * `card_token` against Pagar.me directly, using the public key.
 */
export async function createCardPayment(data: {
  amount: number;
  description: string;
  payerEmail: string;
  payerName: string;
  memberId: string;
  cardToken: string;
  installments?: number;
}): Promise<{
  paymentId: string;
  chargeId: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  providerStatus: string;
  installments: number;
  cardBrand: string | null;
  cardLastFour: string | null;
}> {
  validateAmount(data.amount);
  if (!data.cardToken) {
    throw new AppError(400, 'Cartão não informado.', 'CARD_TOKEN_REQUIRED');
  }

  const payer = await loadClubPayer(data.memberId);
  const amountInCents = pagarme.toCents(data.amount);
  // The plan is a small monthly amount; splitting it makes no sense and the
  // provider would reject an instalment below its floor anyway.
  const installments = Math.max(
    1,
    Math.min(data.installments ?? 1, pagarme.maxInstallmentsFor(data.amount)),
  );

  const paymentId = crypto.randomUUID();
  const order = await pagarme.createOrder(
    {
      code: paymentId,
      customer: payerToPagarmeCustomer(payer),
      items: [
        {
          amount: amountInCents,
          description: data.description.slice(0, 255),
          quantity: 1,
          code: `club-${payer.plan}`,
        },
      ],
      payments: [
        {
          payment_method: 'credit_card',
          credit_card: {
            installments,
            statement_descriptor: env.PAGARME_STATEMENT_DESCRIPTOR,
            card_token: data.cardToken,
          },
        },
      ],
      metadata: { kind: 'club_membership', memberId: payer.id, paymentId },
    },
    { idempotencyKey: pagarme.idempotencyKeyFor('club_card', paymentId, amountInCents) },
  );

  const charge = order.charges?.[0];
  if (!charge) {
    throw new AppError(502, 'O processador não devolveu a cobrança.', 'PAGARME_NO_CHARGE');
  }
  const status = pagarme.mapChargeStatus(charge.status);
  const card = charge.last_transaction?.card;

  await query(
    `INSERT INTO payments
       (id, member_id, amount, method, status, provider, provider_id, provider_status,
        reference, pagarme_order_id, pagarme_charge_id, installments, card_brand, card_last_four)
     VALUES ($1, $2, $3, 'credit_card', $4, 'pagarme', $5, $6, $7, $8, $5, $9, $10, $11)`,
    [
      paymentId,
      payer.id,
      data.amount,
      status,
      charge.id,
      charge.status,
      order.id,
      order.id,
      installments,
      card?.brand ?? null,
      card?.last_four_digits ?? null,
    ],
  );

  // A declined card never fires a webhook worth waiting for, and the member is
  // staring at the form: refuse here, with the acquirer's reason translated.
  if (status === 'failed') {
    await auditLog(
      'payment.failed',
      null,
      {
        paymentId,
        provider: 'pagarme',
        pagarmeChargeId: charge.id,
        providerStatus: charge.status,
        acquirerCode: charge.last_transaction?.acquirer_return_code ?? null,
      },
      payer.id,
    );
    notifyAdminsOfPaymentAsync({
      event: 'payment_failed',
      subject: `Assinatura — ${payer.fullName}`,
      amount: data.amount,
      method: 'credit_card',
      customerName: payer.fullName,
      customerEmail: payer.email,
      link: '/admin?tab=members',
      detail: pagarme.describeChargeFailure(charge),
      chargeId: charge.id,
    });
    throw new AppError(402, pagarme.describeChargeFailure(charge), 'CARD_DECLINED');
  }

  // The webhook still does the activating, so the member is activated exactly
  // once whichever path wins the race. What this returns is only the outcome
  // the browser needs in order to stop showing a spinner.
  await auditLog(
    'payment.card_created',
    null,
    {
      paymentId,
      memberId: payer.id,
      amount: data.amount,
      provider: 'pagarme',
      pagarmeOrderId: order.id,
      pagarmeChargeId: charge.id,
      installments,
      status,
    },
    payer.id,
  );

  return {
    paymentId,
    chargeId: charge.id,
    status,
    providerStatus: charge.status,
    installments,
    cardBrand: card?.brand ?? null,
    cardLastFour: card?.last_four_digits ?? null,
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
/**
 * Does this payment belong to this user?
 *
 * `getPaymentStatus` takes either a Stripe PaymentIntent id or a local payment
 * UUID, so both are matched here. Used to gate the status route, which used to
 * answer for anyone's payment as long as the caller was logged in.
 */
export async function userOwnsPayment(userId: string, paymentId: string): Promise<boolean> {
  // Three id shapes reach this: a Stripe PaymentIntent (`pi_`, legacy), a
  // Pagar.me charge or order (`ch_` / `or_`), and our own row UUID. The
  // provider ids all live in `provider_id`, so only the UUID needs the cast.
  const isProviderId = /^(pi_|ch_|or_)/.test(paymentId);
  const column = isProviderId ? 'p.provider_id' : 'p.id::text';
  const result = await query(
    `SELECT 1
       FROM payments p
       JOIN members m ON m.id = p.member_id
      WHERE ${column} = $1 AND m.user_id = $2
      LIMIT 1`,
    [paymentId, userId]
  );
  return result.rows.length > 0;
}

export async function getPaymentStatus(paymentId: string): Promise<{
  id: string;
  status: string;
  mapped_status: string;
  amount: number;
  currency: string;
  paymentMethod: string | null;
}> {
  // Pagar.me charge — ask the provider, which is authoritative while the
  // webhook is still in flight. This is what the PIX screen polls.
  if (paymentId.startsWith('ch_')) {
    const charge = await pagarme.getCharge(paymentId);
    return {
      id: charge.id,
      status: charge.status,
      mapped_status: pagarme.mapChargeStatus(charge.status),
      amount: pagarme.fromCents(charge.amount),
      currency: 'brl',
      paymentMethod: charge.payment_method ?? null,
    };
  }

  // Pagar.me order — the first charge on it carries the status.
  if (paymentId.startsWith('or_')) {
    const order = await pagarme.getOrder(paymentId);
    const charge = order.charges?.[0];
    return {
      id: order.id,
      status: charge?.status ?? order.status,
      mapped_status: pagarme.mapChargeStatus(charge?.status ?? order.status),
      amount: pagarme.fromCents(charge?.amount ?? order.amount),
      currency: 'brl',
      paymentMethod: charge?.payment_method ?? null,
    };
  }

  // Stripe PaymentIntent — legacy, still queryable so old screens resolve.
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

  // Our own row — the shape the club PIX screen holds on to.
  const result = await query(
    `SELECT id, amount, status, method, pagarme_charge_id FROM payments WHERE id = $1`,
    [paymentId]
  );

  if (result.rows.length === 0) {
    throw new AppError(404, 'Pagamento não encontrado.', 'PAYMENT_NOT_FOUND');
  }

  const row = result.rows[0];

  // A pending Pagar.me row is worth a question to the provider.
  //
  // The webhook is what activates the member, and it is quick — but the person
  // is looking at the QR code with their bank app still open, and "aguardando"
  // for the extra second or two it takes to arrive reads as a failed payment.
  // Asking the charge directly makes the screen flip the moment the money
  // lands. The webhook stays the thing that applies the effects; this only
  // reports, so a lost webhook still cannot activate anyone by itself.
  if (row.status === 'pending' && row.pagarme_charge_id) {
    try {
      const charge = await pagarme.getChargeThrottled(row.pagarme_charge_id as string);
      const mapped = pagarme.mapChargeStatus(charge.status);
      return {
        id: row.id,
        status: charge.status,
        mapped_status: mapped,
        amount: parseFloat(row.amount),
        currency: 'brl',
        paymentMethod: row.method || charge.payment_method || null,
      };
    } catch (err) {
      // The stored status is still a truthful answer; polling must not 500.
      console.error('[PAYMENT] live charge lookup failed, falling back to DB:', err);
    }
  }

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

  // Which provider took the money decides who gives it back. The prefix is the
  // discriminator rather than a stored column, because rows written before the
  // migration have no `provider` and would otherwise be unrefundable.
  const providerId = payment.providerId as string;
  const viaStripe = providerId.startsWith('pi_');

  try {
    if (viaStripe) {
      const stripe = getStripe();
      const stripeReasonMap: Record<string, 'duplicate' | 'fraudulent' | 'requested_by_customer'> = {
        duplicate: 'duplicate',
        fraudulent: 'fraudulent',
      };
      await stripe.refunds.create({
        payment_intent: providerId,
        reason: stripeReasonMap[opts.reason || ''] || 'requested_by_customer',
      });
    } else {
      await pagarme.refundCharge(providerId);
    }
  } catch (err) {
    console.error(`[REFUND] ${viaStripe ? 'Stripe' : 'Pagar.me'} refund call failed:`, err);
    throw new AppError(
      502,
      'Falha ao solicitar reembolso na operadora. Tente novamente em alguns minutos.',
      viaStripe ? 'STRIPE_REFUND_FAILED' : 'PAGARME_REFUND_FAILED',
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
      provider: viaStripe ? 'stripe' : 'pagarme',
      reason: opts.reason || null,
    },
    payment.memberId as string,
  );

  notifyAdminsOfPaymentAsync({
    event: 'payment_refunded',
    subject: `Assinatura — ${(payment.memberName as string) || 'membro'}`,
    amount: payment.amount,
    method: payment.method as string,
    customerName: (payment.memberName as string) ?? null,
    link: '/admin?tab=members',
    detail: opts.reason || 'Estorno solicitado no painel.',
    chargeId: providerId,
  });

  return { ...payment, status: 'refunded' as const };
}
