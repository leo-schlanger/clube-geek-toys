import pg from 'pg';
import { query } from '../config/database.js';

export async function getAuditLogs(opts: { memberId?: string; limit: number }) {
  if (opts.memberId) {
    const result = await query(
      `SELECT * FROM audit_logs WHERE member_id = $1 ORDER BY timestamp DESC LIMIT $2`,
      [opts.memberId, opts.limit]
    );
    return result.rows.map(mapAuditRow);
  }

  const result = await query(
    `SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT $1`,
    [opts.limit]
  );
  return result.rows.map(mapAuditRow);
}

export async function getEmailLogs(opts: { memberId?: string; limit: number }) {
  if (opts.memberId) {
    const result = await query(
      `SELECT * FROM email_logs WHERE member_id = $1 ORDER BY sent_at DESC LIMIT $2`,
      [opts.memberId, opts.limit]
    );
    return result.rows.map(mapEmailLogRow);
  }

  const result = await query(
    `SELECT * FROM email_logs ORDER BY sent_at DESC LIMIT $1`,
    [opts.limit]
  );
  return result.rows.map(mapEmailLogRow);
}

function mapAuditRow(row: pg.QueryResultRow) {
  return {
    id: row.id,
    action: row.action,
    memberId: row.member_id,
    userId: row.user_id,
    details: row.details,
    timestamp: row.timestamp,
  };
}

function mapEmailLogRow(row: pg.QueryResultRow) {
  return {
    id: row.id,
    memberId: row.member_id,
    template: row.template,
    recipient: row.recipient,
    status: row.status,
    resendId: row.resend_id,
    errorMessage: row.error_message,
    sentAt: row.sent_at,
  };
}
