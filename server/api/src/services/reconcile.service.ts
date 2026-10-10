/**
 * Reconciliation — the safety net under the webhook.
 *
 * The webhook is what normally settles a payment, and it is fast. But it is a
 * network delivery from someone else's system, and those get lost: an endpoint
 * that was briefly down, a delivery Pagar.me gave up retrying, or — the case
 * that prompted this — a webhook nobody has registered in the dashboard yet.
 *
 * When that happens the customer has paid and the order sits `pending`: stock
 * never comes down, no confirmation e-mail, and the shop finds out when the
 * buyer complains. This sweeps the pending charges, asks the provider what
 * actually happened, and settles the ones that were paid.
 *
 * Two rules keep it safe to run alongside the webhook:
 *
 *  - **The provider is the only source of truth.** Nothing here settles from
 *    local state; every decision comes from a fresh `GET /charges/:id`.
 *  - **Settlement goes through the same code the webhook uses.** It builds the
 *    same event and hands it to `processPagarmeEvent`, so the idempotency claim
 *    in `processed_webhooks` is what stops a charge being settled twice — by
 *    both paths, or by two overlapping sweeps.
 */

import { query } from '../config/database.js';
import * as pagarme from '../utils/pagarme.js';
import { processPagarmeEvent } from './pagarme-webhook.service.js';
import { abandonCardOrder, updateOrderStatus } from './order.service.js';
import { expireReservation } from './event.service.js';
import { moduleLogger } from '../config/logger.js';
import { alertOpsAsync } from './ops-alert.service.js';
import { sendOrderRecoveryEmail } from './recovery.service.js';

const log = moduleLogger('reconcile');

/**
 * How far back to look.
 *
 * A PIX QR expires in an hour and a card authorises immediately, so anything
 * still pending after a day is either abandoned or a lost delivery — and the
 * abandoned ones cost one API call each. Seven days is generous enough to catch
 * a webhook outage nobody noticed over a weekend.
 */
const LOOKBACK_DAYS = 7;

/** Ceiling per run, so one sweep cannot spend minutes hammering the provider. */
const MAX_PER_RUN = 100;

let consecutiveFailedRuns = 0;

export interface ReconcileResult {
  checked: number;
  settled: number;
  /** Orders closed because their PIX code can no longer be paid. */
  expired: number;
  /** Card orders closed because nobody can pay them any more. */
  abandoned: number;
  failed: number;
}

/**
 * Grace after `expires_at` before an order is written off.
 *
 * Guards against clock skew between us and the provider, and against a payment
 * that lands in the same minute the code lapses — cancelling an order somebody
 * just paid would be far worse than leaving it open an extra hour.
 */
const EXPIRY_GRACE_MS = 60 * 60 * 1000;

/**
 * Can this PIX still be paid?
 *
 * An expired Pagar.me PIX does **not** change status: it stays `pending` with
 * `waiting_payment` forever — measured on real charges two days past their
 * `expires_at`. So nothing ever closes those orders, and the shop's "PIX
 * aguardando" queue fills with dead rows it can only clear by hand.
 */
function isDeadPix(charge: pagarme.PagarmeCharge): boolean {
  if (charge.payment_method !== 'pix') return false;
  const expiresAt = charge.last_transaction?.expires_at;
  if (!expiresAt) return false;
  const at = new Date(expiresAt).getTime();
  return Number.isFinite(at) && Date.now() - at > EXPIRY_GRACE_MS;
}

interface PendingCharge {
  chargeId: string;
  ref: string;
  orderId: string | null;
  reservationId: string | null;
}

/**
 * A row worth asking the provider about: still open on our side, with a charge.
 *
 * Orders, club payments and ticket reservations are swept together because they
 * settle through the same event — `processPagarmeEvent` routes on the charge's
 * own metadata.
 */
async function pendingCharges(): Promise<PendingCharge[]> {
  const result = await query(
    `SELECT pagarme_charge_id AS charge_id, 'pedido #' || order_number AS ref,
            id AS order_id, NULL::uuid AS reservation_id
       FROM orders
      WHERE status = 'pending'
        AND pagarme_charge_id IS NOT NULL
        AND created_at > NOW() - ($1::int * INTERVAL '1 day')
      UNION ALL
     SELECT pagarme_charge_id AS charge_id, 'pagamento ' || id::text AS ref,
            NULL::uuid AS order_id, NULL::uuid AS reservation_id
       FROM payments
      WHERE status = 'pending'
        AND pagarme_charge_id IS NOT NULL
        AND created_at > NOW() - ($1::int * INTERVAL '1 day')
      UNION ALL
     SELECT pagarme_charge_id AS charge_id, 'reserva ' || code AS ref,
            NULL::uuid AS order_id, id AS reservation_id
       FROM event_reservations
      WHERE status = 'pending'
        AND pagarme_charge_id IS NOT NULL
        AND created_at > NOW() - ($1::int * INTERVAL '1 day')
      LIMIT $2`,
    [LOOKBACK_DAYS, MAX_PER_RUN],
  );
  return result.rows.map((r) => ({
    chargeId: r.charge_id as string,
    ref: r.ref as string,
    orderId: (r.order_id as string) ?? null,
    reservationId: (r.reservation_id as string) ?? null,
  }));
}

/**
 * Ask the provider about every open charge and settle the paid ones.
 *
 * Never throws: it runs from cron and from an admin button, and a provider
 * hiccup on one charge must not stop the sweep reaching the next.
 */
export async function reconcilePendingCharges(): Promise<ReconcileResult> {
  if (!pagarme.isPagarmeConfigured()) {
    return { checked: 0, settled: 0, expired: 0, abandoned: 0, failed: 0 };
  }

  const rows = await pendingCharges();
  const result: ReconcileResult = { checked: 0, settled: 0, expired: 0, abandoned: 0, failed: 0 };

  for (const { chargeId, ref, orderId, reservationId } of rows) {
    result.checked += 1;
    try {
      // Deliberately the uncached lookup: settling money must never act on a
      // few-seconds-old answer kept for the polling screens.
      const charge = await pagarme.getCharge(chargeId);

      if (pagarme.mapChargeStatus(charge.status) !== 'paid') {
        // A PIX past its expiry can never be paid, so leaving the order open
        // only grows a queue nobody can clear. Cancelling goes through
        // `updateOrderStatus`, which is what releases the stock hold, returns
        // store credit and tells the customer — doing it with a bare UPDATE
        // here would skip all three.
        if (isDeadPix(charge) && orderId) {
          // The buyer gets the "não foi concluído" invitation instead of a bare
          // "cancelado": they wanted the item, and nothing was charged.
          await updateOrderStatus(orderId, 'cancelled', 'system-reconcile', { notifyCustomer: false });
          await sendOrderRecoveryEmail(orderId, 'pix_expired');
          result.expired += 1;
          log.info(`${ref}: PIX expirado em ${charge.last_transaction?.expires_at} — pedido cancelado`);
        } else if (isDeadPix(charge) && reservationId) {
          if (await expireReservation(reservationId)) {
            result.expired += 1;
            log.info(`${ref}: PIX expirado em ${charge.last_transaction?.expires_at} — reserva cancelada`);
          }
        }
        continue;
      }

      // Hand it to the webhook processor rather than settling here. The claim
      // on `processed_webhooks` is what makes this safe to run next to a real
      // delivery — whichever arrives second finds the key taken and does
      // nothing. The key is derived from the charge, so it is stable across
      // runs instead of minting a new one every sweep.
      await processPagarmeEvent({
        id: `reconcile_${charge.id}`,
        type: 'charge.paid',
        data: charge as unknown as Record<string, unknown>,
      });

      result.settled += 1;
      log.info(`${ref}: cobrança ${chargeId} estava paga — liquidada`);
    } catch (err) {
      result.failed += 1;
      log.error({ err }, `${ref}: falha ao conciliar ${chargeId}`);
    }
  }

  result.abandoned = await closeAbandonedCardOrders();

  // One provider hiccup is noise; the same sweep failing twice in a row (20
  // minutes) means payments may be sitting unsettled.
  consecutiveFailedRuns = result.failed > 0 ? consecutiveFailedRuns + 1 : 0;
  if (consecutiveFailedRuns >= 2) {
    alertOpsAsync({
      kind: 'reconcile_failing',
      subject: `Conciliação de pagamentos falhando (${result.failed} cobrança(s))`,
      body:
        `A conciliação falhou em ${consecutiveFailedRuns} rodadas seguidas; na última, ` +
        `${result.failed} de ${result.checked} cobrança(s) deram erro. Pagamentos podem estar ` +
        `pagos na Pagar.me e pendentes aqui.\n\n` +
        `Onde olhar:\n  journalctl CONTAINER_NAME=clube-geek-api --since -1h -o cat | jq 'select(.module=="reconcile")'\n` +
        `  GET /health → payments`,
      cooldownMin: 120,
    });
  }

  if (result.settled > 0 || result.expired > 0 || result.abandoned > 0 || result.failed > 0) {
    log.info(`${result.checked} verificada(s), ${result.settled} liquidada(s), ` +
        `${result.expired} expirada(s), ${result.abandoned} cartão abandonado(s), ` +
        `${result.failed} com erro`);
  }

  // Leave a heartbeat even on a quiet run.
  //
  // A sweep with nothing to settle logs nothing, which makes a working cron
  // look exactly like a stopped one. That matters more here than in the daily
  // jobs: while the webhook is not registered, this is the *only* thing that
  // confirms a payment, and "it has been silent" would be indistinguishable
  // from "it has been dead". Surfaced in `GET /health`.
  await query(
    `INSERT INTO config (key, value)
     VALUES ('last_reconcile_run', to_jsonb(NOW()::text))
     ON CONFLICT (key) DO UPDATE SET value = to_jsonb(NOW()::text), updated_at = NOW()`,
  ).catch((err) => log.error({ err }, 'heartbeat falhou'));

  return result;
}

/**
 * How long a card order may sit unpaid after its last attempt.
 *
 * The buyer either tries again within minutes or has left the checkout; an
 * hour is long past the first and keeps a slow second attempt safe.
 */
const CARD_ABANDON_AFTER_MINUTES = 60;

/**
 * Close card orders that can no longer be paid.
 *
 * Only the checkout screen can charge a card order, so one the buyer walked
 * away from would otherwise sit `pending` forever, holding its stock and
 * reading in the panel like a sale about to happen. `abandonCardOrder` asks the
 * provider before closing anything that has a charge.
 */
export async function closeAbandonedCardOrders(): Promise<number> {
  const rows = await query(
    `SELECT id, order_number FROM orders
      WHERE status = 'pending'
        AND payment_method = 'credit_card'
        AND stripe_payment_intent_id IS NULL
        AND created_at < NOW() - ($1::int * INTERVAL '1 minute')
        AND (payment_failed_at IS NULL
             OR payment_failed_at < NOW() - ($1::int * INTERVAL '1 minute'))
      ORDER BY created_at
      LIMIT $2`,
    [CARD_ABANDON_AFTER_MINUTES, MAX_PER_RUN],
  ).catch((err) => {
    log.error({ err }, 'busca de cartões abandonados falhou');
    return { rows: [] as Record<string, unknown>[] };
  });

  let closed = 0;
  for (const row of rows.rows) {
    try {
      if (await abandonCardOrder(row.id as string, 'system-reconcile')) {
        closed += 1;
        await sendOrderRecoveryEmail(row.id as string, 'card_abandoned');
        log.info(`pedido #${row.order_number}: cartão não concluído — pedido cancelado`);
      }
    } catch (err) {
      log.error({ err }, `pedido #${row.order_number}: falha ao fechar cartão abandonado`);
    }
  }
  return closed;
}

/**
 * When the sweep last ran, for `GET /health`.
 *
 * Null means it has never run in this deployment — which, while the webhook is
 * unregistered, means nothing is confirming payments at all.
 */
export async function lastReconcileRun(): Promise<string | null> {
  const result = await query(`SELECT value FROM config WHERE key = 'last_reconcile_run'`);
  const raw = result.rows[0]?.value;
  return typeof raw === 'string' ? raw : null;
}
