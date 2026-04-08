import cron from 'node-cron';
import { query, getClient } from '../config/database.js';
import { sendTemplateEmail } from './email.service.js';

export function initCronJobs() {
  // Daily at 6:00 AM UTC (3:00 AM BRT)
  cron.schedule('0 6 * * *', async () => {
    console.log('[CRON] Running daily jobs...');
    try {
      await expirePoints();
    } catch (err) {
      console.error('[CRON] Expire points error:', err);
    }
    try {
      await sendRenewalReminders();
    } catch (err) {
      console.error('[CRON] Renewal reminders error:', err);
    }
  });

  console.log('[CRON] Scheduled daily jobs at 6:00 AM UTC');
}

async function expirePoints() {
  const today = new Date().toISOString().split('T')[0];

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Find and lock expired earn transactions (SKIP LOCKED prevents double-processing)
    const expiredTxs = await client.query(
      `SELECT id, member_id, points FROM point_transactions
       WHERE type = 'earn' AND expired = FALSE AND expires_at IS NOT NULL AND expires_at < $1
       FOR UPDATE SKIP LOCKED`,
      [today]
    );

    if (expiredTxs.rows.length === 0) {
      await client.query('COMMIT');
      console.log('[CRON] No points to expire');
      return;
    }

    for (const tx of expiredTxs.rows) {
      // Mark as expired
      await client.query('UPDATE point_transactions SET expired = TRUE WHERE id = $1', [tx.id]);

      // Get and lock current balance
      const memberResult = await client.query(
        'SELECT points FROM members WHERE id = $1 FOR UPDATE',
        [tx.member_id]
      );
      if (memberResult.rows.length === 0) continue;

      const newBalance = Math.max(0, memberResult.rows[0].points - tx.points);

      // Create expire transaction
      await client.query(
        `INSERT INTO point_transactions (member_id, type, points, balance, description)
         VALUES ($1, 'expire', $2, $3, 'Pontos expirados')`,
        [tx.member_id, -tx.points, newBalance]
      );

      // Update member balance
      await client.query('UPDATE members SET points = $1 WHERE id = $2', [newBalance, tx.member_id]);
    }

    await client.query('COMMIT');
    console.log(`[CRON] Expired ${expiredTxs.rows.length} point transactions`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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
