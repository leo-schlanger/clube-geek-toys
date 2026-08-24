import cron from 'node-cron';
import { query } from '../config/database.js';
import { env, adminUrl } from '../config/env.js';
import { sendTemplateEmail } from './email.service.js';
import { getActionItems } from './report.service.js';
import { releaseReservationById } from './order.service.js';
import { purgeExpiredRefreshSessions } from './auth.service.js';

export function initCronJobs() {
  // Daily at 6:00 AM UTC (3:00 AM BRT)
  cron.schedule('0 6 * * *', async () => {
    console.log('[CRON] Running daily jobs...');
    try {
      await sendRenewalReminders();
    } catch (err) {
      console.error('[CRON] Renewal reminders error:', err);
    }
    try {
      await expireMembers();
    } catch (err) {
      console.error('[CRON] Expire members error:', err);
    }
    try {
      await releaseExpiredStockReservations();
    } catch (err) {
      console.error('[CRON] Expire stock reservations error:', err);
    }
    try {
      const purged = await purgeExpiredRefreshSessions();
      if (purged > 0) console.log(`[CRON] Purged ${purged} expired refresh session(s)`);
    } catch (err) {
      console.error('[CRON] Purge refresh sessions error:', err);
    }
    try {
      await purgeOldRows();
    } catch (err) {
      console.error('[CRON] Purge old rows error:', err);
    }
    // Last: it reports on the state the two jobs above just left behind.
    try {
      await sendAdminDailyDigest();
    } catch (err) {
      console.error('[CRON] Admin daily digest error:', err);
    }

    // Record cron execution for health monitoring
    await query(
      `INSERT INTO config (key, value) VALUES ('last_cron_run', to_jsonb(NOW()::text))
       ON CONFLICT (key) DO UPDATE SET value = to_jsonb(NOW()::text), updated_at = NOW()`
    ).catch(err => console.error('[CRON] Health log error:', err));

    console.log('[CRON] All daily jobs completed');
  });

  console.log('[CRON] Scheduled daily jobs at 6:00 AM UTC');
}

/**
 * Hand back the stock held by pending orders nobody ever paid.
 *
 * The hold is what stops two people buying the same last unit, but it has to
 * end: PIX has no webhook, so an abandoned checkout would otherwise keep a piece
 * off the shelf forever.
 *
 * The order stays `pending` on purpose. Releasing the hold is not the same as
 * deciding the sale is dead — a late PIX can still be confirmed by an admin,
 * and if the stock is gone by then that confirmation now leaves an oversale
 * trail instead of silently clamping to zero.
 */
async function releaseExpiredStockReservations() {
  const expired = await query(
    `SELECT id, order_number FROM orders
      WHERE stock_reserved = TRUE
        AND status = 'pending'
        AND reservation_expires_at IS NOT NULL
        AND reservation_expires_at < NOW()
      ORDER BY reservation_expires_at
      LIMIT 500`
  );
  if (expired.rows.length === 0) {
    console.log('[CRON] No expired stock reservations');
    return;
  }
  let released = 0;
  for (const row of expired.rows) {
    try {
      if (await releaseReservationById(row.id)) released++;
    } catch (err) {
      // One bad order must not stop the rest from being released.
      console.error(`[CRON] Release reservation failed for order ${row.order_number}:`, err);
    }
  }
  console.log(`[CRON] Released ${released} expired stock reservation(s)`);
}

/**
 * Retention.
 *
 * `schema.sql` documents `consumed_verification_tokens` as "cron cleans up rows
 * older than 48h" and even creates `idx_consumed_tokens_consumed_at` for it —
 * but that job was never written, so the table grew one row per e-mail
 * verification, forever. Same story for the other write-only logs.
 *
 * `audit_logs` and `stock_movements` are deliberately absent: they carry
 * accounting and legal value and must not be trimmed on a timer.
 */
async function purgeOldRows(): Promise<void> {
  const targets: { table: string; column: string; keep: string }[] = [
    // The whole point is one-time use; 48h is far past any live link.
    { table: 'consumed_verification_tokens', column: 'consumed_at', keep: '48 hours' },
    // Fed by the browser, so this is the fastest-growing and least controlled.
    { table: 'error_logs', column: 'created_at', keep: '90 days' },
    // Read back by the digest and the reminders — a year is well past both.
    { table: 'email_logs', column: 'sent_at', keep: '1 year' },
    // Stripe never re-delivers anything this old.
    { table: 'processed_webhooks', column: 'created_at', keep: '90 days' },
  ];

  for (const t of targets) {
    try {
      // `to_regclass` so a volume without the table is skipped, not an error.
      const exists = await query(`SELECT to_regclass($1) AS t`, [t.table]);
      if (!exists.rows[0]?.t) continue;
      const deleted = await query(
        `DELETE FROM ${t.table} WHERE ${t.column} < NOW() - INTERVAL '${t.keep}'`
      );
      if (deleted.rowCount) {
        console.log(`[CRON] Purged ${deleted.rowCount} row(s) from ${t.table}`);
      }
    } catch (err) {
      // One table must not stop the rest.
      console.error(`[CRON] Purge failed for ${t.table}:`, err);
    }
  }
}

/**
 * One morning e-mail with every queue that needs a human.
 *
 * The panel only shows this to whoever opens it; the shop's most time-sensitive
 * queue (PIX awaiting manual confirmation — there is no webhook) can otherwise
 * sit unnoticed for a day. Silent when nothing is pending, so the e-mail keeps
 * meaning something.
 */
async function sendAdminDailyDigest() {
  if (!env.ADMIN_EMAIL) return;

  const report = await getActionItems();
  if (report.totalPending === 0) {
    console.log('[CRON] Daily digest skipped - no pending items');
    return;
  }

  // The job runs once a day, but a container restart re-registers the schedule;
  // this keeps a same-day rerun from sending a second copy.
  const alreadySent = await query(
    `SELECT 1 FROM email_logs
     WHERE template = 'admin-daily-digest' AND status = 'sent' AND sent_at::date = CURRENT_DATE
     LIMIT 1`
  );
  if (alreadySent.rowCount) {
    console.log('[CRON] Daily digest already sent today');
    return;
  }

  const counts: Record<string, string> = {};
  for (const item of report.items) counts[item.key] = String(item.count);

  await sendTemplateEmail({
    template: 'admin-daily-digest',
    to: env.ADMIN_EMAIL,
    variables: {
      ...counts,
      total_pending: String(report.totalPending),
      admin_url: adminUrl(),
    },
  });

  console.log(`[CRON] Daily digest sent - ${report.totalPending} pending item(s)`);
}

async function sendRenewalReminders() {
  // Members expiring in 5-8 days (range instead of exact date, in case cron misses a day)
  // Deduplicates via email_logs check
  const result = await query(
    `SELECT m.id, m.full_name, m.email, m.plan, m.expiry_date
     FROM members m
     WHERE m.status = 'active'
       AND m.expiry_date BETWEEN CURRENT_DATE + INTERVAL '5 days' AND CURRENT_DATE + INTERVAL '8 days'
       AND m.auto_renewal = FALSE
       AND NOT EXISTS (
         SELECT 1 FROM email_logs el
         WHERE el.member_id = m.id
           AND el.template = 'renewal-reminder'
           AND el.sent_at > CURRENT_DATE - INTERVAL '5 days'
       )`
  );

  let sent = 0;
  for (const member of result.rows) {
    try {
      await sendTemplateEmail({
        template: 'renewal-reminder',
        to: member.email,
        variables: {
          name: member.full_name,
          plan: member.plan,
          expiry_date: new Date(member.expiry_date).toLocaleDateString('pt-BR'),
        },
        member_id: member.id,
      });
      sent++;
    } catch (err) {
      console.error(`[CRON] Failed to send reminder to ${member.email}:`, err);
    }
  }

  console.log(`[CRON] Sent ${sent} renewal reminders`);
}

async function expireMembers() {
  // Mark active members as expired when their expiry_date has passed.
  // Includes:
  // - One-time payers (auto_renewal = FALSE)
  // - Paused subscriptions (auto_renewal = TRUE but subscription_status = 'paused')
  // - Cancelled subscriptions (auto_renewal = FALSE, caught by first condition)
  // Excludes:
  // - Active subscriptions (auto_renewal = TRUE and subscription_status != 'paused')
  //   because Stripe will continue charging and extending expiry automatically
  const result = await query(
    `UPDATE members SET status = 'expired'
     WHERE status = 'active'
       AND expiry_date IS NOT NULL
       AND expiry_date < CURRENT_DATE
       AND (auto_renewal = FALSE OR subscription_status = 'paused')
     RETURNING id, full_name, email`
  );

  if (result.rowCount && result.rowCount > 0) {
    console.log(`[CRON] Expired ${result.rowCount} members`);

    for (const member of result.rows) {
      // Audit log
      await query(
        `INSERT INTO audit_logs (action, member_id, details)
         VALUES ('member_expired', $1, '{"reason":"expiry_date_passed","auto":true}')`,
        [member.id]
      ).catch(() => {});

      // Notify member (fetch plan for email)
      const planResult = await query('SELECT plan FROM members WHERE id = $1', [member.id]);
      sendTemplateEmail({
        template: 'member-expired',
        to: member.email,
        variables: {
          name: member.full_name,
          plan: planResult.rows[0]?.plan || '',
        },
        member_id: member.id,
      }).catch((err) => console.error(`[CRON] Failed to send expiry email to ${member.email}:`, err));
    }
  } else {
    console.log('[CRON] No members to expire');
  }
}
