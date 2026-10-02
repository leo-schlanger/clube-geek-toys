/**
 * Infrastructure alerts — the one place the API tells a person something broke.
 *
 * Before this, an infrastructure failure (reconciliation erroring, the schema
 * degraded at boot, e-mails bouncing, a burst of 500s) wrote a line to stdout
 * and nothing else: the logs were wiped at each deploy and nobody read them.
 * Payment and sale notices have their own channel (`admin-notification`);
 * this one is for the things only the maintainer can fix, and goes to
 * `OPS_ALERT_EMAIL` (falling back to `ADMIN_EMAIL`).
 *
 * Every alert has a `kind`, and a kind fires at most once per `cooldownMin`.
 * The last firing is kept in the `config` table, not in memory, so a crash
 * loop that restarts the API every minute still sends one e-mail, not sixty.
 *
 * Never throws: alerting must not be the thing that breaks the request.
 */

import { claimCooldown } from '../utils/cooldown.js';
import { env } from '../config/env.js';
import { moduleLogger } from '../config/logger.js';

const log = moduleLogger('ops-alert');

const RESEND_API_URL = 'https://api.resend.com/emails';

export type OpsAlertKind =
  | 'schema_degraded'
  | 'reconcile_failing'
  | 'email_failing'
  | 'http_5xx_burst'
  | 'cron_failed';

export interface OpsAlert {
  kind: OpsAlertKind;
  subject: string;
  /** Plain text: what happened, what it affects, where to look. */
  body: string;
  /** Minimum minutes between two alerts of this kind. Default 60. */
  cooldownMin?: number;
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function alertOps(alert: OpsAlert): Promise<boolean> {
  try {
    log.error({ kind: alert.kind }, `ALERT: ${alert.subject}`);
    if (!(await claimCooldown(`ops_alert_${alert.kind}`, alert.cooldownMin ?? 60))) return false;

    const to = env.OPS_ALERT_EMAIL ?? env.ADMIN_EMAIL;
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.FROM_EMAIL,
        to,
        subject: `[ALERTA] ${alert.subject}`,
        html:
          `<pre style="font-family:monospace;white-space:pre-wrap">${escape(alert.body)}</pre>` +
          `<p style="color:#888;font-size:12px">Alerta automático da API (${escape(alert.kind)}). ` +
          `Repetições do mesmo tipo ficam suprimidas por ${alert.cooldownMin ?? 60} min.</p>`,
      }),
    });
    if (!response.ok) {
      log.error({ status: response.status, kind: alert.kind }, 'ops alert e-mail refused');
      return false;
    }
    return true;
  } catch (err) {
    log.error({ err, kind: alert.kind }, 'ops alert failed');
    return false;
  }
}

/** Fire-and-forget form, for call sites that must not wait. */
export function alertOpsAsync(alert: OpsAlert): void {
  void alertOps(alert);
}

// ─── 5xx burst ───────────────────────────────────────────────────────────────

const BURST_WINDOW_MS = 10 * 60 * 1000;
const BURST_THRESHOLD = 20;
let recent5xx: number[] = [];

/**
 * Count a 5xx; alert when the last ten minutes pass the threshold.
 *
 * In memory on purpose: it measures *this* process, and a restart that clears
 * it is itself a fresh start. One 500 is a bug report; twenty in ten minutes
 * is an outage.
 */
export function record5xx(path: string, now = Date.now()): void {
  recent5xx = recent5xx.filter((t) => now - t < BURST_WINDOW_MS);
  recent5xx.push(now);
  if (recent5xx.length === BURST_THRESHOLD) {
    alertOpsAsync({
      kind: 'http_5xx_burst',
      subject: `${BURST_THRESHOLD} erros 500 em 10 minutos`,
      body:
        `A API respondeu ${BURST_THRESHOLD} erros 500 nos últimos 10 minutos (o último em ${path}).\n\n` +
        `Onde olhar:\n` +
        `  journalctl CONTAINER_NAME=clube-geek-api --since -15min -o cat | jq 'select(.level=="error")'\n` +
        `  Painel admin → Logs → Erros`,
    });
  }
}

/** For tests. */
export function reset5xxWindow(): void {
  recent5xx = [];
}
