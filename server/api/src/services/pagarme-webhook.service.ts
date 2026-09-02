/**
 * Pagar.me webhook processor.
 *
 * This is what makes PIX self-service. The old static BR Code was watched by
 * nobody: a customer paid, and the order sat `pending` until an admin compared
 * it against the bank statement. Pagar.me reconciles the transfer and fires
 * `charge.paid` seconds later, so the order settles itself.
 *
 * Idempotency follows the Stripe processor's proven shape: the claim on
 * `processed_webhooks` is INSERTed in the SAME transaction as the effects, so a
 * failure rolls back both and a redelivery can re-process. E-mails and credit
 * restores are queued and run AFTER the commit, so nothing is sent for work
 * that got rolled back.
 */

import pg from 'pg';
import { getClient } from '../config/database.js';
import { env } from '../config/env.js';
import * as pagarme from '../utils/pagarme.js';
import { sendTemplateEmail } from './email.service.js';
import { auditLog } from '../utils/audit.js';
import { decrementStockForOrder, restoreStockForOrder, releaseReservation } from './order.service.js';
import { restoreCreditForOrder } from './store-credit.service.js';
import { notifyAdminsOfPayment, type AdminPaymentNotice } from './admin-notification.service.js';

// ─── Envelope ────────────────────────────────────────────────────────────────

export interface PagarmeWebhookEvent {
  id: string;
  type: string;
  created_at?: string;
  account?: { id?: string; name?: string };
  data: Record<string, unknown>;
}

interface PendingEmail {
  template: string;
  to: string;
  variables: Record<string, string>;
  member_id?: string;
}

/** Work deferred until after COMMIT, so it reflects persisted state. */
interface Deferred {
  emails: PendingEmail[];
  creditRestores: string[];
  adminNotices: AdminPaymentNotice[];
}

// ─── Authenticity ────────────────────────────────────────────────────────────

/**
 * Constant-time comparison, so a wrong password cannot be found byte by byte.
 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  // Node's timingSafeEqual throws on length mismatch, which the guard above
  // already handled — an unequal length is not a secret worth protecting.
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) diff |= bufA[i]! ^ bufB[i]!;
  return diff === 0;
}

/**
 * Verify the Basic-auth credentials Pagar.me was configured to send.
 *
 * Pagar.me v5 has no HMAC signature: the endpoint is protected by a user and
 * password set in their dashboard and sent in the `Authorization` header. That
 * is a shared secret rather than a proof of origin, which is exactly why
 * `confirmChargeIsPaid` below exists — the two together are what make a forged
 * "charge.paid" useless.
 */
export function verifyWebhookAuth(authorizationHeader: string | undefined): boolean {
  const user = env.PAGARME_WEBHOOK_USER;
  const password = env.PAGARME_WEBHOOK_PASSWORD;

  if (!user || !password) {
    // Outside production an unconfigured endpoint is how you test locally; the
    // env schema refuses this combination in production, so this branch cannot
    // be reached there.
    return env.NODE_ENV !== 'production';
  }
  if (!authorizationHeader?.startsWith('Basic ')) return false;

  const decoded = Buffer.from(authorizationHeader.slice(6), 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator < 0) return false;

  return (
    safeEqual(decoded.slice(0, separator), user) &&
    safeEqual(decoded.slice(separator + 1), password)
  );
}

/**
 * Re-read the charge from the API before believing it was paid.
 *
 * The password in the header proves the caller knows a shared secret; it does
 * not prove the body is genuine. Money-moving events therefore get confirmed
 * against Pagar.me itself, so a forged payload settles nothing — the worst it
 * can do is waste one API call.
 *
 * A lookup failure is treated as "not confirmed" and the event is left
 * unprocessed, which makes the delivery retry rather than settle on a guess.
 */
async function confirmChargeIsPaid(chargeId: string): Promise<pagarme.PagarmeCharge | null> {
  try {
    const charge = await pagarme.getCharge(chargeId);
    return pagarme.mapChargeStatus(charge.status) === 'paid' ? charge : null;
  } catch (err) {
    console.error(`[PAGARME-HOOK] could not confirm charge ${chargeId}:`, err);
    return null;
  }
}

// ─── Payload helpers ─────────────────────────────────────────────────────────

/** The charge a `charge.*` event carries, or the first charge of an order event. */
function extractCharge(event: PagarmeWebhookEvent): pagarme.PagarmeCharge | null {
  const data = event.data as unknown as Record<string, unknown>;
  if (typeof data.id === 'string' && data.id.startsWith('ch_')) {
    return data as unknown as pagarme.PagarmeCharge;
  }
  const charges = data.charges as pagarme.PagarmeCharge[] | undefined;
  if (Array.isArray(charges) && charges.length > 0) return charges[0]!;
  // An invoice carries its charge under `charge`.
  const charge = data.charge as pagarme.PagarmeCharge | undefined;
  if (charge?.id) return charge;
  return null;
}

/**
 * Metadata for events that do **not** move money.
 *
 * Merges the envelope's metadata with the charge's. Fine for a decline or a
 * cancellation, where the worst case is a log line or a notification about the
 * wrong reference.
 */
function metadataOf(event: PagarmeWebhookEvent, charge: pagarme.PagarmeCharge | null) {
  const fromData = (event.data.metadata ?? {}) as Record<string, string>;
  return { ...fromData, ...(charge?.metadata ?? {}) };
}

/**
 * Metadata for events that settle money — **only** from the re-read charge.
 *
 * The envelope is deliberately ignored here. The body is not signed, so a
 * caller who knows the webhook password could pair a genuinely paid charge id
 * with an `orderId` of their choosing and have a real payment settle somebody
 * else's order. What Pagar.me itself stored on the charge cannot be steered
 * that way, and it is what we wrote when we created the charge.
 */
function trustedMetadata(charge: pagarme.PagarmeCharge): Record<string, string> {
  return charge.metadata ?? {};
}

/** Pagar.me subscription id on an invoice, in either of the shapes it arrives. */
function subscriptionIdOf(data: Record<string, unknown>): string | null {
  const sub = data.subscription;
  if (typeof sub === 'string') return sub;
  if (sub && typeof sub === 'object' && typeof (sub as { id?: string }).id === 'string') {
    return (sub as { id: string }).id;
  }
  return null;
}

function formatBRL(amount: number): string {
  return amount.toFixed(2).replace('.', ',');
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function processPagarmeEvent(event: PagarmeWebhookEvent): Promise<void> {
  const webhookKey = `pagarme_${event.id}`;
  const deferred: Deferred = { emails: [], creditRestores: [], adminNotices: [] };

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const claim = await client.query(
      `INSERT INTO processed_webhooks (webhook_key, type, action, data_id, request_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (webhook_key) DO NOTHING
       RETURNING webhook_key`,
      [webhookKey, 'pagarme', event.type, event.id, '']
    );
    if (claim.rowCount === 0) {
      console.log(`[PAGARME-HOOK] Already processed: ${webhookKey}`);
      await client.query('ROLLBACK');
      return;
    }

    await route(client, event, deferred);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  for (const orderId of deferred.creditRestores) {
    try {
      const amount = await restoreCreditForOrder(orderId, {
        note: 'Crédito devolvido (pedido cancelado ou reembolsado)',
      });
      if (amount > 0) {
        await auditLog('order.credit_restored', null, { orderId, amount, reason: 'order_closed' });
      }
    } catch (err) {
      console.error(`[PAGARME-HOOK] Credit restore failed (order=${orderId}):`, err);
    }
  }

  for (const job of deferred.emails) {
    try {
      await sendTemplateEmail(job);
    } catch (err) {
      console.error(`[PAGARME-HOOK] Email failed (${job.template} → ${job.to}):`, err);
    }
  }

  for (const notice of deferred.adminNotices) {
    await notifyAdminsOfPayment(notice);
  }
}

async function route(
  client: pg.PoolClient,
  event: PagarmeWebhookEvent,
  deferred: Deferred,
): Promise<void> {
  switch (event.type) {
    // `order.paid` and `charge.paid` describe the same money. Both are handled
    // because Pagar.me fires whichever the account is subscribed to, and the
    // `processed_webhooks` claim is per event id — so subscribing to both
    // settles once and logs the second as already processed.
    case 'charge.paid':
    case 'order.paid':
      await handlePaid(client, event, deferred);
      break;

    case 'charge.payment_failed':
    case 'order.payment_failed':
      await handlePaymentFailed(client, event, deferred);
      break;

    case 'charge.refunded':
    case 'charge.partial_canceled':
      await handleRefunded(client, event, deferred);
      break;

    // A cancel is the only thing that ends a shop order. A decline does not —
    // see `handlePaymentFailed`.
    case 'order.canceled':
      await handleOrderCanceled(client, event, deferred);
      break;

    case 'charge.chargedback':
    case 'chargeback.received':
      await handleChargeback(client, event, deferred);
      break;

    case 'invoice.paid':
      await handleInvoicePaid(client, event, deferred);
      break;

    case 'invoice.payment_failed':
      await handleInvoiceFailed(client, event, deferred);
      break;

    case 'subscription.canceled':
      await handleSubscriptionCanceled(client, event, deferred);
      break;

    default:
      console.log(`[PAGARME-HOOK] Unhandled event type: ${event.type}`);
  }
}

// ─── charge.paid / order.paid ────────────────────────────────────────────────

async function handlePaid(
  client: pg.PoolClient,
  event: PagarmeWebhookEvent,
  deferred: Deferred,
): Promise<void> {
  const payload = extractCharge(event);
  if (!payload?.id) {
    console.warn('[PAGARME-HOOK] paid event without a charge id — ignoring');
    return;
  }

  // Never settle on the body alone: ask Pagar.me whether this charge is paid.
  const charge = await confirmChargeIsPaid(payload.id);
  if (!charge) {
    throw new Error(
      `Charge ${payload.id} is not paid at the provider — refusing to settle on the payload alone`,
    );
  }

  const metadata = trustedMetadata(charge);
  if (metadata.kind === 'shop_order' || metadata.orderId) {
    await settleShopOrder(client, charge, metadata, deferred);
    return;
  }
  await settleClubPayment(client, charge, metadata, deferred);
}

async function settleShopOrder(
  client: pg.PoolClient,
  charge: pagarme.PagarmeCharge,
  metadata: Record<string, string>,
  deferred: Deferred,
): Promise<void> {
  // `cancelled` is accepted alongside `pending` on purpose. Captured money must
  // always land on the order — if anything cancelled it while the charge was in
  // flight, dropping the success silently is the worst of both worlds. Anything
  // already `paid` (or beyond) matches nothing and returns below.
  const updated = await client.query(
    `UPDATE orders
        SET status = 'paid', paid_at = NOW(), payment_method = $2,
            pagarme_charge_id = COALESCE(pagarme_charge_id, $1),
            payment_provider = 'pagarme'
      WHERE (pagarme_charge_id = $1 OR id = $3::uuid)
        AND status IN ('pending', 'cancelled')
      RETURNING id, order_number, customer_name, customer_email, total, delivery_method`,
    [
      charge.id,
      charge.payment_method === 'pix' ? 'pix' : 'credit_card',
      metadata.orderId ?? null,
    ]
  );

  const order = updated.rows[0];
  if (!order) {
    console.log(`[PAGARME-HOOK] charge ${charge.id}: no pending order to settle`);
    return;
  }

  // Stock comes down only now that the money is confirmed.
  await decrementStockForOrder(client, order.id as string);

  deferred.emails.push({
    template: 'order-confirmed',
    to: order.customer_email as string,
    variables: {
      name: order.customer_name as string,
      order_number: String(order.order_number),
      total: parseFloat(order.total as string).toFixed(2).replace('.', ','),
      order_id: order.id as string,
      delivery_method: (order.delivery_method as string) || 'shipping',
    },
  });

  deferred.adminNotices.push({
    event: 'payment_received',
    subject: `Pedido #${order.order_number}`,
    amount: parseFloat(order.total as string),
    method: charge.payment_method ?? null,
    customerName: order.customer_name as string,
    customerEmail: order.customer_email as string,
    link: '/admin?tab=orders',
    chargeId: charge.id,
  });

  await auditLog('order.paid', null, {
    orderId: order.id,
    orderNumber: order.order_number,
    pagarmeChargeId: charge.id,
    amount: pagarme.fromCents(charge.amount),
    provider: 'pagarme',
  });
}

async function settleClubPayment(
  client: pg.PoolClient,
  charge: pagarme.PagarmeCharge,
  metadata: Record<string, string>,
  deferred: Deferred,
): Promise<void> {
  const amount = pagarme.fromCents(charge.paid_amount ?? charge.amount);

  const paid = await client.query(
    `UPDATE payments
        SET status = 'paid', provider_status = $2, paid_at = NOW(), webhook_processed_at = NOW()
      WHERE pagarme_charge_id = $1 AND status <> 'paid'
      RETURNING id, member_id`,
    [charge.id, charge.status]
  );

  const memberId = (paid.rows[0]?.member_id as string) ?? metadata.memberId;
  if (!memberId) {
    console.warn(`[PAGARME-HOOK] charge ${charge.id} settled no payment and carries no memberId`);
    return;
  }
  if (paid.rowCount === 0) {
    // Already paid — the row was settled by an earlier delivery or by the
    // synchronous card response. Nothing left to activate.
    console.log(`[PAGARME-HOOK] charge ${charge.id}: payment already paid`);
    return;
  }

  await activateMember(client, memberId, charge.id, amount, deferred);

  deferred.adminNotices.push({
    event: 'payment_received',
    subject: 'Assinatura do clube',
    amount,
    method: charge.payment_method ?? null,
    link: '/admin?tab=members',
    chargeId: charge.id,
  });

  await auditLog(
    'payment.received',
    null,
    { pagarmeChargeId: charge.id, amount, provider: 'pagarme' },
    memberId,
  );
}

// ─── charge.payment_failed ───────────────────────────────────────────────────

async function handlePaymentFailed(
  client: pg.PoolClient,
  event: PagarmeWebhookEvent,
  deferred: Deferred,
): Promise<void> {
  const charge = extractCharge(event);
  if (!charge?.id) return;
  const metadata = metadataOf(event, charge);

  // A shop order records the decline but is **not** cancelled.
  //
  // A decline is the most ordinary thing in a checkout — "card refused, try
  // another one" — and the order still holds its stock for that retry. Ending
  // it here is what once made the successful second attempt land on a dead
  // order: money captured, stock never decremented, no e-mail. Only an explicit
  // cancel closes an order; otherwise the TTL sweep does it if the buyer walks.
  if (metadata.kind === 'shop_order' || metadata.orderId) {
    await auditLog('order.payment_failed', null, {
      orderId: metadata.orderId ?? null,
      pagarmeChargeId: charge.id,
      providerStatus: charge.status,
      acquirerCode: charge.last_transaction?.acquirer_return_code ?? null,
    });
    deferred.adminNotices.push({
      event: 'payment_failed',
      subject: metadata.orderNumber ? `Pedido #${metadata.orderNumber}` : 'Pedido da loja',
      amount: pagarme.fromCents(charge.amount),
      method: charge.payment_method ?? null,
      link: '/admin?tab=orders',
      detail: pagarme.describeChargeFailure(charge),
      chargeId: charge.id,
    });
    return;
  }

  await client.query(
    `UPDATE payments SET status = 'failed', provider_status = $2, webhook_processed_at = NOW()
      WHERE pagarme_charge_id = $1 AND status = 'pending'`,
    [charge.id, charge.status]
  );

  const memberId = metadata.memberId;
  if (!memberId) return;

  const member = await client.query(
    'SELECT id, email, full_name FROM members WHERE id = $1',
    [memberId]
  );
  if (member.rows.length > 0) {
    const m = member.rows[0]!;
    deferred.emails.push({
      template: 'payment-failed',
      to: m.email as string,
      variables: { name: m.full_name as string },
      member_id: m.id as string,
    });
  }

  deferred.adminNotices.push({
    event: 'payment_failed',
    subject: 'Assinatura do clube',
    amount: pagarme.fromCents(charge.amount),
    method: charge.payment_method ?? null,
    link: '/admin?tab=members',
    detail: pagarme.describeChargeFailure(charge),
    chargeId: charge.id,
  });

  await auditLog(
    'payment.failed',
    null,
    { pagarmeChargeId: charge.id, providerStatus: charge.status, provider: 'pagarme' },
    memberId,
  );
}

// ─── charge.refunded ─────────────────────────────────────────────────────────

/**
 * A refund issued anywhere — the Pagar.me dashboard, our own panel, or the API.
 *
 * A partial refund is treated the same as a full one on purpose: the shop has
 * no concept of a partially refunded order, and leaving it `paid` would keep
 * counting the whole amount as revenue.
 */
async function handleRefunded(
  client: pg.PoolClient,
  event: PagarmeWebhookEvent,
  deferred: Deferred,
): Promise<void> {
  const charge = extractCharge(event);
  if (!charge?.id) return;

  const updated = await client.query(
    `UPDATE orders SET status = 'refunded', updated_at = NOW()
      WHERE pagarme_charge_id = $1 AND status <> 'refunded'
      RETURNING id, order_number, customer_name, customer_email, total, store_credit_applied`,
    [charge.id]
  );
  const order = updated.rows[0];

  if (order) {
    await restoreStockForOrder(client, order.id as string);
    if (parseFloat((order.store_credit_applied as string) || '0') > 0) {
      deferred.creditRestores.push(order.id as string);
    }
    deferred.adminNotices.push({
      event: 'payment_refunded',
      subject: `Pedido #${order.order_number}`,
      amount: parseFloat(order.total as string),
      method: charge.payment_method ?? null,
      customerName: order.customer_name as string,
      customerEmail: order.customer_email as string,
      link: '/admin?tab=orders',
      chargeId: charge.id,
    });
    await auditLog('order.refunded_via_provider', null, {
      orderId: order.id,
      orderNumber: order.order_number,
      pagarmeChargeId: charge.id,
      provider: 'pagarme',
    });
    return;
  }

  // Not a shop order — a club payment then.
  const payment = await client.query(
    `UPDATE payments SET status = 'refunded', updated_at = NOW()
      WHERE pagarme_charge_id = $1 AND status <> 'refunded'
      RETURNING id, member_id, amount`,
    [charge.id]
  );
  if (payment.rows.length === 0) return;

  deferred.adminNotices.push({
    event: 'payment_refunded',
    subject: 'Assinatura do clube',
    amount: parseFloat(payment.rows[0]!.amount as string),
    method: charge.payment_method ?? null,
    link: '/admin?tab=members',
    chargeId: charge.id,
  });
  await auditLog(
    'payment.refunded',
    null,
    { pagarmeChargeId: charge.id, provider: 'pagarme', external: true },
    payment.rows[0]!.member_id as string,
  );
}

// ─── order.canceled ──────────────────────────────────────────────────────────

async function handleOrderCanceled(
  client: pg.PoolClient,
  event: PagarmeWebhookEvent,
  deferred: Deferred,
): Promise<void> {
  const charge = extractCharge(event);
  const orderIdFromMeta = metadataOf(event, charge).orderId ?? null;
  const pagarmeOrderId = typeof event.data.id === 'string' ? event.data.id : null;

  const cancelled = await client.query(
    `UPDATE orders SET status = 'cancelled'
      WHERE status = 'pending'
        AND (pagarme_order_id = $1 OR pagarme_charge_id = $2 OR id = $3::uuid)
      RETURNING id, store_credit_applied`,
    [pagarmeOrderId, charge?.id ?? null, orderIdFromMeta]
  );
  const row = cancelled.rows[0];
  if (!row) return;

  // The hold outlives the order otherwise: the TTL sweep only visits `pending`.
  await releaseReservation(client, row.id as string);
  if (parseFloat((row.store_credit_applied as string) || '0') > 0) {
    deferred.creditRestores.push(row.id as string);
  }
  await auditLog('order.payment_cancelled', null, {
    orderId: row.id,
    pagarmeOrderId,
    provider: 'pagarme',
  });
}

// ─── chargeback ──────────────────────────────────────────────────────────────

/** Money is already gone; a human decides what to do, so this only raises a flag. */
async function handleChargeback(
  client: pg.PoolClient,
  event: PagarmeWebhookEvent,
  deferred: Deferred,
): Promise<void> {
  const charge = extractCharge(event);
  const chargeId = charge?.id ?? null;

  const found = chargeId
    ? await client.query(
        `SELECT id, order_number, customer_name, customer_email, total
           FROM orders WHERE pagarme_charge_id = $1`,
        [chargeId]
      )
    : { rows: [] as pg.QueryResultRow[] };
  const order = found.rows[0];
  const amount = charge ? pagarme.fromCents(charge.amount) : 0;

  await auditLog('order.disputed', null, {
    orderId: order?.id ?? null,
    orderNumber: order?.order_number ?? null,
    pagarmeChargeId: chargeId,
    amount,
    provider: 'pagarme',
  });

  if (env.ADMIN_EMAIL) {
    deferred.emails.push({
      template: 'admin-order-disputed',
      to: env.ADMIN_EMAIL,
      variables: {
        order_number: order ? String(order.order_number) : '—',
        customer_name: (order?.customer_name as string) ?? '—',
        customer_email: (order?.customer_email as string) ?? '—',
        amount: formatBRL(amount),
        reason: (event.data.reason as string) ?? 'não informado',
        due_by: '—',
      },
    });
  }

  deferred.adminNotices.push({
    event: 'payment_chargeback',
    subject: order ? `Pedido #${order.order_number}` : 'Cobrança contestada',
    amount,
    method: charge?.payment_method ?? null,
    customerName: (order?.customer_name as string) ?? null,
    customerEmail: (order?.customer_email as string) ?? null,
    link: '/admin?tab=orders',
    detail: 'O valor já saiu da conta. Responda pelo painel da Pagar.me.',
    chargeId,
  });
}

// ─── invoice.paid (subscription renewal) ─────────────────────────────────────

async function handleInvoicePaid(
  client: pg.PoolClient,
  event: PagarmeWebhookEvent,
  deferred: Deferred,
): Promise<void> {
  const subscriptionId = subscriptionIdOf(event.data);
  if (!subscriptionId) {
    console.log('[PAGARME-HOOK] invoice.paid without subscription — ignoring');
    return;
  }

  const invoiceId = String(event.data.id ?? '');
  const amount = pagarme.fromCents(Number(event.data.amount ?? 0));

  await client.query(
    `INSERT INTO subscription_payments (id, subscription_id, member_id, amount, status, provider_payment_id)
     SELECT $1, id, member_id, $2, 'paid', $3
       FROM subscriptions WHERE provider_id = $4
     ON CONFLICT (id) DO UPDATE SET status = 'paid'`,
    [`sp_${invoiceId}`, amount, invoiceId, subscriptionId]
  );

  // Mirror the invoice into `payments`, which is the ONLY table the reports
  // read. Without this, every recurring charge from the second month on is
  // invisible to the dashboard and club revenue reads as total churn.
  await client.query(
    `INSERT INTO payments (member_id, amount, method, status, provider, provider_id,
                           provider_status, reference, paid_at)
     SELECT m.id, $1, 'credit_card', 'paid', 'pagarme', $2, 'invoice.paid', $2, NOW()
       FROM members m
       JOIN subscriptions s ON m.subscription_id = s.id
      WHERE s.provider_id = $3
        AND NOT EXISTS (SELECT 1 FROM payments WHERE provider_id = $2)`,
    [amount, invoiceId, subscriptionId]
  );

  const cycleEnd = (event.data.cycle as { end_at?: string } | undefined)?.end_at ?? null;
  await client.query(
    `UPDATE subscriptions
        SET failed_payments = 0,
            last_payment_date = NOW(),
            next_payment_date = COALESCE($2::timestamptz, next_payment_date)
      WHERE provider_id = $1`,
    [subscriptionId, cycleEnd]
  );

  const memberResult = await client.query(
    `SELECT m.id, m.email, m.full_name, m.plan, m.payment_type
       FROM members m
       JOIN subscriptions s ON m.subscription_id = s.id
      WHERE s.provider_id = $1`,
    [subscriptionId]
  );
  if (memberResult.rows.length === 0) {
    console.warn(`[PAGARME-HOOK] invoice.paid — no member for subscription ${subscriptionId}`);
    return;
  }

  const member = memberResult.rows[0]!;
  const interval = member.payment_type === 'annual' ? '1 year' : '1 month';

  // Anchor on today whenever the stored date is missing or stale: `expiry_date`
  // is nullable, and `NULL + interval` is NULL — which leaves a paying member
  // `active` with no expiry, and that reads as expired everywhere it matters
  // (the shop discount and the digital card both require a date >= today).
  await client.query(
    `UPDATE members
        SET expiry_date = GREATEST(COALESCE(expiry_date, CURRENT_DATE), CURRENT_DATE) + $2::interval,
            status = 'active',
            payment_count = payment_count + 1
      WHERE id = $1`,
    [member.id, interval]
  );

  const updated = await client.query('SELECT expiry_date FROM members WHERE id = $1', [member.id]);
  const nextPayment = updated.rows[0]?.expiry_date
    ? new Date(updated.rows[0].expiry_date as string).toLocaleDateString('pt-BR')
    : '—';

  deferred.emails.push({
    template: 'subscription-payment',
    to: member.email as string,
    variables: {
      name: member.full_name as string,
      amount: formatBRL(amount),
      plan: member.plan as string,
      next_payment: nextPayment,
    },
    member_id: member.id as string,
  });

  deferred.adminNotices.push({
    event: 'payment_received',
    subject: `Assinatura — ${member.full_name}`,
    amount,
    method: 'credit_card',
    customerName: member.full_name as string,
    customerEmail: member.email as string,
    link: '/admin?tab=members',
    detail: 'Renovação automática.',
    chargeId: invoiceId,
  });

  await auditLog(
    'subscription.charge.succeeded',
    null,
    { subscriptionId, invoiceId, amount, provider: 'pagarme' },
    member.id as string,
  );
}

// ─── invoice.payment_failed ──────────────────────────────────────────────────

async function handleInvoiceFailed(
  client: pg.PoolClient,
  event: PagarmeWebhookEvent,
  deferred: Deferred,
): Promise<void> {
  const subscriptionId = subscriptionIdOf(event.data);
  if (!subscriptionId) return;

  const amount = pagarme.fromCents(Number(event.data.amount ?? 0));

  const result = await client.query(
    `UPDATE subscriptions SET failed_payments = failed_payments + 1
      WHERE provider_id = $1
      RETURNING failed_payments, id`,
    [subscriptionId]
  );
  if (result.rows.length === 0) {
    console.warn(`[PAGARME-HOOK] invoice.payment_failed — unknown subscription ${subscriptionId}`);
    return;
  }

  const failedCount = Number(result.rows[0]!.failed_payments);
  const internalSubId = result.rows[0]!.id as string;

  const memberResult = await client.query(
    `SELECT id, email, full_name, plan FROM members WHERE subscription_id = $1`,
    [internalSubId]
  );
  const member = memberResult.rows[0];

  if (member) {
    deferred.emails.push({
      template: 'subscription-payment-failed',
      to: member.email as string,
      variables: {
        name: member.full_name as string,
        amount: formatBRL(amount),
        failed_count: String(failedCount),
      },
      member_id: member.id as string,
    });
    await auditLog(
      'subscription.charge.failed',
      null,
      { subscriptionId, failedCount, amount, provider: 'pagarme' },
      member.id as string,
    );
  }

  deferred.adminNotices.push({
    event: 'payment_failed',
    subject: `Assinatura — ${(member?.full_name as string) ?? 'membro'}`,
    amount,
    method: 'credit_card',
    customerName: (member?.full_name as string) ?? null,
    customerEmail: (member?.email as string) ?? null,
    link: '/admin?tab=members',
    detail: `${failedCount}ª tentativa recusada.`,
  });

  // Three strikes and the subscription is done.
  if (failedCount >= 3) {
    await client.query(
      `UPDATE subscriptions SET status = 'cancelled', cancelled_at = NOW() WHERE provider_id = $1`,
      [subscriptionId]
    );
    await client.query(
      `UPDATE members SET subscription_status = 'cancelled', auto_renewal = FALSE
        WHERE subscription_id = $1`,
      [internalSubId]
    );
    if (member) {
      deferred.emails.push({
        template: 'subscription-cancelled',
        to: member.email as string,
        variables: { name: member.full_name as string },
        member_id: member.id as string,
      });
      await auditLog(
        'subscription.cancelled',
        null,
        { subscriptionId, reason: 'failed_payments_threshold', failedCount },
        member.id as string,
      );
    }
  }
}

// ─── subscription.canceled ───────────────────────────────────────────────────

async function handleSubscriptionCanceled(
  client: pg.PoolClient,
  event: PagarmeWebhookEvent,
  deferred: Deferred,
): Promise<void> {
  const subscriptionId = String(event.data.id ?? '');
  if (!subscriptionId) return;

  await client.query(
    `UPDATE subscriptions SET status = 'cancelled', cancelled_at = NOW() WHERE provider_id = $1`,
    [subscriptionId]
  );

  // `subscription_status <> 'cancelled'` is what stops the duplicate e-mail:
  // our own `cancelSubscription` mails the member and then calls the API, which
  // fires this very event. Zero rows means the app already told them; a cancel
  // made straight in the Pagar.me dashboard still finds the member active and
  // is announced normally.
  const memberResult = await client.query(
    `UPDATE members SET subscription_status = 'cancelled', auto_renewal = FALSE
       FROM subscriptions s
      WHERE members.subscription_id = s.id
        AND s.provider_id = $1
        AND members.subscription_status <> 'cancelled'
      RETURNING members.id, members.email, members.full_name`,
    [subscriptionId]
  );

  if (memberResult.rows.length > 0) {
    const member = memberResult.rows[0]!;
    deferred.emails.push({
      template: 'subscription-cancelled',
      to: member.email as string,
      variables: { name: member.full_name as string },
      member_id: member.id as string,
    });
    await auditLog(
      'subscription.cancelled',
      null,
      { subscriptionId, reason: 'cancelled_externally', provider: 'pagarme' },
      member.id as string,
    );
  }
}

// ─── Shared: activate a member after a one-off payment ───────────────────────

async function activateMember(
  client: pg.PoolClient,
  memberId: string,
  paymentRef: string,
  amount: number,
  deferred: Deferred,
): Promise<void> {
  const memberLookup = await client.query(
    'SELECT id, payment_type, status, expiry_date, email, full_name, plan FROM members WHERE id = $1 FOR UPDATE',
    [memberId]
  );
  if (memberLookup.rows.length === 0) return;

  const member = memberLookup.rows[0]!;
  const beforeStatus = member.status as string;
  const now = new Date();

  // Renewal extends from the current expiry so the member keeps the days they
  // already paid for; a new or lapsed activation starts from today.
  const currentExpiry = member.expiry_date ? new Date(member.expiry_date as string) : null;
  const isRenewal = beforeStatus === 'active' && currentExpiry && currentExpiry > now;
  const expiryDate = new Date(isRenewal ? currentExpiry : now);
  expiryDate.setMonth(expiryDate.getMonth() + 1);

  await client.query(
    `UPDATE members SET status = 'active', start_date = COALESCE(start_date, $1), expiry_date = $2,
            activated_at = COALESCE(activated_at, NOW()), activated_by_payment = $3,
            pending_payment = NULL, payment_count = payment_count + 1, payment_type = 'monthly'
      WHERE id = $4`,
    [
      now.toISOString().split('T')[0],
      expiryDate.toISOString().split('T')[0],
      paymentRef,
      member.id,
    ]
  );

  await auditLog(
    'member.activated',
    null,
    {
      paymentRef,
      amount,
      provider: 'pagarme',
      before: { status: beforeStatus },
      after: { status: 'active', expiryDate: expiryDate.toISOString().split('T')[0] },
    },
    member.id as string,
  );

  deferred.emails.push({
    template: 'payment-confirmed',
    to: member.email as string,
    variables: {
      name: member.full_name as string,
      amount: formatBRL(amount),
      plan: member.plan as string,
      expiry_date: expiryDate.toLocaleDateString('pt-BR'),
    },
    member_id: member.id as string,
  });

  if (beforeStatus !== 'active') {
    deferred.emails.push({
      template: 'welcome',
      to: member.email as string,
      variables: { name: member.full_name as string, plan: member.plan as string },
      member_id: member.id as string,
    });
  }
}

/** Exposed for the health check: is the webhook endpoint able to authenticate? */
export function webhookAuthConfigured(): boolean {
  return Boolean(env.PAGARME_WEBHOOK_USER && env.PAGARME_WEBHOOK_PASSWORD);
}

export const __testing = { safeEqual, extractCharge, subscriptionIdOf };
