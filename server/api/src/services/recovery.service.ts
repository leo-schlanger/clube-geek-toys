import { query } from '../config/database.js';
import { SHOP_CANONICAL_URL } from '../config/env.js';
import { moduleLogger } from '../config/logger.js';
import { sendTemplateEmail } from './email.service.js';
import { auditLog } from '../utils/audit.js';

const log = moduleLogger('recovery');

/**
 * One recovery e-mail of each kind per address per week. Someone who tried
 * nine times in a day (it happened, 01/10/2026) still hears from us once.
 */
const RECOVERY_COOLDOWN_DAYS = 7;

/** Club sign-ups get the reminder after a day, and not after a week. */
const SIGNUP_REMINDER_AFTER_HOURS = 24;
const SIGNUP_REMINDER_UNTIL_DAYS = 7;

/** "BRUNA DE BARROS" → "Bruna": the greeting, not the full name in capitals. */
export function firstName(fullName: string | null | undefined, fallback: string): string {
  const first = (fullName ?? '').trim().split(/\s+/)[0] ?? '';
  if (!first) return fallback;
  return first.charAt(0).toLocaleUpperCase('pt-BR') + first.slice(1).toLocaleLowerCase('pt-BR');
}

export type OrderRecoveryReason = 'card_abandoned' | 'pix_expired';

/** Sentence for the refusal the order recorded, if it recorded one. */
function declineHint(kind: string | null): string {
  switch (kind) {
    case 'funds':
      return 'Na última tentativa, o banco recusou o cartão por limite — no PIX isso não acontece.';
    case 'antifraud':
      return 'Na última tentativa, a compra não passou na análise de segurança do cartão — no PIX isso não acontece.';
    case 'issuer':
      return 'Na última tentativa, o banco do cartão recusou a compra.';
    default:
      return '';
  }
}

async function recentlySent(template: string, recipient: string): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM email_logs
      WHERE template = $1 AND lower(recipient) = lower($2) AND status = 'sent'
        AND sent_at > NOW() - ($3::int * INTERVAL '1 day')
      LIMIT 1`,
    [template, recipient, RECOVERY_COOLDOWN_DAYS],
  );
  return result.rows.length > 0;
}

/**
 * Invite the buyer back after the system closed an order nobody paid.
 *
 * Called by the reconciliation, never by the buyer's own "Voltar" — that one
 * usually switched to PIX on the spot. Skipped when the same address bought
 * since, or still has an order open: the e-mail is for a sale that was lost,
 * not one that moved. Never throws.
 */
export async function sendOrderRecoveryEmail(
  orderId: string,
  reason: OrderRecoveryReason,
): Promise<boolean> {
  try {
    const found = await query(
      `SELECT o.id, o.order_number, o.customer_name, o.customer_email, o.total, o.created_at,
              o.payment_error_kind,
              (SELECT oi.product_name FROM order_items oi WHERE oi.order_id = o.id
                ORDER BY oi.line_total DESC LIMIT 1) AS product_name,
              (SELECT oi.product_slug FROM order_items oi WHERE oi.order_id = o.id
                ORDER BY oi.line_total DESC LIMIT 1) AS product_slug
         FROM orders o
        WHERE o.id = $1 AND o.status = 'cancelled' AND o.paid_at IS NULL`,
      [orderId],
    );
    const order = found.rows[0];
    if (!order?.customer_email) return false;
    const email = order.customer_email as string;

    const movedOn = await query(
      `SELECT 1 FROM orders
        WHERE lower(customer_email) = lower($1) AND id <> $2
          AND (paid_at > $3 OR (status = 'pending' AND created_at > $3))
        LIMIT 1`,
      [email, order.id, order.created_at],
    );
    if (movedOn.rows.length > 0) return false;
    if (await recentlySent('order-not-completed', email)) return false;

    const slug = order.product_slug as string | null;
    await sendTemplateEmail({
      template: 'order-not-completed',
      to: email,
      variables: {
        name: firstName(order.customer_name as string, 'cliente'),
        order_number: String(order.order_number),
        total: parseFloat(order.total as string).toFixed(2).replace('.', ','),
        product_name: (order.product_name as string) || '',
        product_url: slug ? `${SHOP_CANONICAL_URL}/produto/${slug}` : SHOP_CANONICAL_URL,
        reason,
        decline_hint: declineHint(order.payment_error_kind as string | null),
      },
    });
    await auditLog('order.recovery_email_sent', null, {
      orderId: order.id,
      orderNumber: order.order_number,
      reason,
    });
    return true;
  } catch (err) {
    log.error({ err }, `recovery e-mail failed (order ${orderId})`);
    return false;
  }
}

/**
 * Remind people who signed up for the club and never paid.
 *
 * A refused card left a member alone on the form (09/10/2026), and nobody
 * came back for her. Once per address, a day after the sign-up and only within
 * the first week — after that it is a cold e-mail, not a reminder.
 */
export async function sendClubSignupReminders(): Promise<number> {
  const pending = await query(
    `SELECT m.id, m.full_name, m.email
       FROM members m
      WHERE m.status = 'pending'
        AND m.created_at < NOW() - ($1::int * INTERVAL '1 hour')
        AND m.created_at > NOW() - ($2::int * INTERVAL '1 day')
        AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.member_id = m.id AND p.status = 'paid')
        AND NOT EXISTS (
          SELECT 1 FROM email_logs e
           WHERE e.template = 'club-signup-reminder' AND lower(e.recipient) = lower(m.email)
             AND e.status = 'sent'
        )
      ORDER BY m.created_at
      LIMIT 50`,
    [SIGNUP_REMINDER_AFTER_HOURS, SIGNUP_REMINDER_UNTIL_DAYS],
  );

  let sent = 0;
  for (const member of pending.rows) {
    try {
      await sendTemplateEmail({
        template: 'club-signup-reminder',
        to: member.email as string,
        variables: { name: firstName(member.full_name as string, 'Membro') },
        member_id: member.id as string,
      });
      sent += 1;
    } catch (err) {
      log.error({ err }, `signup reminder failed (member ${member.id})`);
    }
  }
  if (sent > 0) log.info(`${sent} lembrete(s) de cadastro do clube enviado(s)`);
  return sent;
}
