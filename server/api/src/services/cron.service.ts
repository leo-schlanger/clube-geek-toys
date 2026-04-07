import cron from 'node-cron';
import { query, getClient } from '../config/database.js';
import { sendTemplateEmail } from './email.service.js';

export function initCronJobs() {
  // Daily at 6:00 AM UTC (3:00 AM BRT) — same as Cloudflare cron
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

  // Find expired earn transactions
  const expiredTxs = await query(
    `SELECT id, member_id, points FROM point_transactions
     WHERE type = 'earn' AND expired = FALSE AND expires_at IS NOT NULL AND expires_at < $1`,
    [today]
  );

  if (expiredTxs.rows.length === 0) {
    console.log('[CRON] No points to expire');
    return;
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    for (const tx of expiredTxs.rows) {
      // Mark as expired
      await client.query('UPDATE point_transactions SET expired = TRUE WHERE id = $1', [tx.id]);

      // Get current balance
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
  // Members expiring in exactly 7 days
  const result = await query(
    `SELECT m.id, m.full_name, m.email, m.plan, m.expiry_date
     FROM members m
     WHERE m.status = 'active' AND m.expiry_date = CURRENT_DATE + INTERVAL '7 days'
     AND m.auto_renewal = FALSE`
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
