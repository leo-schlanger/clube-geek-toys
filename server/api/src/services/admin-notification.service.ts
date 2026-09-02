/**
 * Payment notifications for the staff.
 *
 * Two channels, deliberately separate:
 *
 *  - **In-app**: one `notifications` row per admin/seller user, which is what
 *    the bell in the admin panel reads. Cheap, survives a closed inbox, and is
 *    the record of what happened.
 *  - **E-mail**: a single message to `ADMIN_EMAIL`, for the events worth
 *    interrupting someone over.
 *
 * Nothing here is allowed to throw into a payment path. A notification that
 * fails must never roll back a charge that succeeded, so every public function
 * swallows its own errors and logs them.
 */

import { query } from '../config/database.js';
import { env, adminUrl } from '../config/env.js';
import { sendTemplateEmail } from './email.service.js';
import { getSetting } from './settings.service.js';

export type AdminPaymentEvent =
  | 'payment_received'
  | 'payment_pending'
  | 'payment_failed'
  | 'payment_refunded'
  | 'payment_chargeback';

export interface AdminPaymentNotice {
  event: AdminPaymentEvent;
  /** "Pedido #1234" or "Assinatura — Fulano". Shown as the notification title. */
  subject: string;
  amount: number;
  /** 'pix' | 'credit_card' | ... — shown to the admin as a label. */
  method?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  /** Path inside the admin SPA, e.g. `/admin?tab=orders`. */
  link?: string;
  /** One extra line: the decline reason, the refund reason, the dispute cause. */
  detail?: string | null;
  /** Provider charge id, for reconciling against the Pagar.me dashboard. */
  chargeId?: string | null;
}

/** Which events are loud enough to send an e-mail, regardless of settings. */
const ALWAYS_EMAIL: AdminPaymentEvent[] = ['payment_chargeback', 'payment_refunded'];

const EVENT_LABEL: Record<AdminPaymentEvent, string> = {
  payment_received: 'Pagamento confirmado',
  payment_pending: 'Pagamento aguardando',
  payment_failed: 'Pagamento recusado',
  payment_refunded: 'Pagamento estornado',
  payment_chargeback: 'Chargeback aberto',
};

const METHOD_LABEL: Record<string, string> = {
  pix: 'PIX',
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  boleto: 'Boleto',
  cash: 'Dinheiro',
  store_credit: 'Crédito da loja',
};

export function methodLabel(method: string | null | undefined): string {
  if (!method) return '—';
  return METHOD_LABEL[method] ?? method;
}

function formatBRL(amount: number): string {
  return amount.toFixed(2).replace('.', ',');
}

/**
 * The staff who should see this.
 *
 * Sellers are included for the money events because they work the counter and
 * the PIX queue; `disabled` accounts are excluded by the role filter itself.
 */
async function staffUserIds(): Promise<string[]> {
  const result = await query(
    `SELECT id FROM users WHERE role IN ('admin', 'seller') ORDER BY role`,
  );
  return result.rows.map((r) => r.id as string);
}

/**
 * Fan the notice out to every staff account.
 *
 * One INSERT for all of them: this runs on the webhook path, where an extra
 * round-trip per admin is an extra round-trip while Pagar.me waits for a 200.
 */
async function insertInApp(notice: AdminPaymentNotice): Promise<number> {
  const userIds = await staffUserIds();
  if (userIds.length === 0) return 0;

  const title = `${EVENT_LABEL[notice.event]} · ${notice.subject}`;
  const bodyParts = [
    `R$ ${formatBRL(notice.amount)}`,
    notice.method ? methodLabel(notice.method) : null,
    notice.customerName || null,
    notice.detail || null,
  ].filter(Boolean);

  await query(
    `INSERT INTO notifications (user_id, kind, title, body, link)
     SELECT unnest($1::uuid[]), $2, $3, $4, $5`,
    [userIds, notice.event, title.slice(0, 200), bodyParts.join(' · '), notice.link ?? '/admin?tab=orders'],
  );
  return userIds.length;
}

/**
 * Should this event e-mail anyone?
 *
 * A busy shop does not want a message per PIX, so the threshold and the switch
 * are settings rather than constants — except for refunds and chargebacks,
 * which always go out.
 */
async function shouldEmail(notice: AdminPaymentNotice): Promise<boolean> {
  if (ALWAYS_EMAIL.includes(notice.event)) return true;
  const enabled = await getSetting<boolean>('notifications.admin_payment_email');
  if (!enabled) return false;
  const min = await getSetting<number>('notifications.admin_payment_min_amount');
  return notice.amount >= (min ?? 0);
}

/**
 * Tell the staff about a payment event.
 *
 * Fire-and-forget by design: callers `void` it, or await it only where they are
 * already outside a transaction.
 */
export async function notifyAdminsOfPayment(notice: AdminPaymentNotice): Promise<void> {
  try {
    const inApp = await getSetting<boolean>('notifications.admin_payment_inapp').catch(() => true);
    if (inApp !== false) {
      await insertInApp(notice);
    }
  } catch (err) {
    console.error(`[ADMIN-NOTIFY] in-app failed (${notice.event}):`, err);
  }

  try {
    if (!env.ADMIN_EMAIL) return;
    if (!(await shouldEmail(notice))) return;

    await sendTemplateEmail({
      template: 'admin-payment-event',
      to: env.ADMIN_EMAIL,
      variables: {
        event_label: EVENT_LABEL[notice.event],
        subject: notice.subject,
        amount: formatBRL(notice.amount),
        method: methodLabel(notice.method),
        customer_name: notice.customerName || '—',
        customer_email: notice.customerEmail || '—',
        detail: notice.detail || '',
        charge_id: notice.chargeId || '—',
        // The link is stored relative for the in-app bell; the e-mail needs the
        // absolute admin host, which `adminUrl` is the single source of.
        admin_url: adminUrl(notice.link ?? '/admin?tab=orders'),
        // Drives the accent colour of the e-mail header.
        tone:
          notice.event === 'payment_received'
            ? 'good'
            : notice.event === 'payment_pending'
              ? 'warn'
              : 'bad',
      },
    });
  } catch (err) {
    console.error(`[ADMIN-NOTIFY] email failed (${notice.event}):`, err);
  }
}

/** Same thing, but never awaited — for use inside request handlers. */
export function notifyAdminsOfPaymentAsync(notice: AdminPaymentNotice): void {
  void notifyAdminsOfPayment(notice).catch((err) =>
    console.error('[ADMIN-NOTIFY] unexpected:', err),
  );
}
