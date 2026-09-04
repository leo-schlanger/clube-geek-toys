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

export interface ReconcileResult {
  checked: number;
  settled: number;
  failed: number;
}

/**
 * A row worth asking the provider about: still open on our side, with a charge.
 *
 * Orders and club payments are swept together because they settle through the
 * same event — `processPagarmeEvent` routes on the charge's own metadata.
 */
async function pendingCharges(): Promise<{ chargeId: string; ref: string }[]> {
  const result = await query(
    `SELECT pagarme_charge_id AS charge_id, 'pedido #' || order_number AS ref
       FROM orders
      WHERE status = 'pending'
        AND pagarme_charge_id IS NOT NULL
        AND created_at > NOW() - ($1::int * INTERVAL '1 day')
      UNION ALL
     SELECT pagarme_charge_id AS charge_id, 'pagamento ' || id::text AS ref
       FROM payments
      WHERE status = 'pending'
        AND pagarme_charge_id IS NOT NULL
        AND created_at > NOW() - ($1::int * INTERVAL '1 day')
      LIMIT $2`,
    [LOOKBACK_DAYS, MAX_PER_RUN],
  );
  return result.rows.map((r) => ({ chargeId: r.charge_id as string, ref: r.ref as string }));
}

/**
 * Ask the provider about every open charge and settle the paid ones.
 *
 * Never throws: it runs from cron and from an admin button, and a provider
 * hiccup on one charge must not stop the sweep reaching the next.
 */
export async function reconcilePendingCharges(): Promise<ReconcileResult> {
  if (!pagarme.isPagarmeConfigured()) {
    return { checked: 0, settled: 0, failed: 0 };
  }

  const rows = await pendingCharges();
  const result: ReconcileResult = { checked: 0, settled: 0, failed: 0 };

  for (const { chargeId, ref } of rows) {
    result.checked += 1;
    try {
      // Deliberately the uncached lookup: settling money must never act on a
      // few-seconds-old answer kept for the polling screens.
      const charge = await pagarme.getCharge(chargeId);
      if (pagarme.mapChargeStatus(charge.status) !== 'paid') continue;

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
      console.log(`[RECONCILE] ${ref}: cobrança ${chargeId} estava paga — liquidada`);
    } catch (err) {
      result.failed += 1;
      console.error(`[RECONCILE] ${ref}: falha ao conciliar ${chargeId}:`, err);
    }
  }

  if (result.settled > 0 || result.failed > 0) {
    console.log(
      `[RECONCILE] ${result.checked} verificada(s), ${result.settled} liquidada(s), ${result.failed} com erro`,
    );
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
  ).catch((err) => console.error('[RECONCILE] heartbeat falhou:', err));

  return result;
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
