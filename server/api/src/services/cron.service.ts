import cron from 'node-cron';
import { query } from '../config/database.js';
import { sendTemplateEmail } from './email.service.js';

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

    // Record cron execution for health monitoring
    await query(
      `INSERT INTO config (key, value) VALUES ('last_cron_run', to_jsonb(NOW()::text))
       ON CONFLICT (key) DO UPDATE SET value = to_jsonb(NOW()::text), updated_at = NOW()`
    ).catch(err => console.error('[CRON] Health log error:', err));

    console.log('[CRON] All daily jobs completed');
  });

  console.log('[CRON] Scheduled daily jobs at 6:00 AM UTC');
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
