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

// ============================================
// Error Logs
// ============================================

interface CreateErrorLog {
  severity: string;
  message: string;
  stack?: string;
  source: 'frontend' | 'backend';
  context?: Record<string, unknown>;
  userId?: string;
  url?: string;
  userAgent?: string;
  ipAddress?: string;
}

export async function createErrorLog(data: CreateErrorLog) {
  const result = await query(
    `INSERT INTO error_logs (severity, message, stack, source, context, user_id, url, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      data.severity,
      data.message.slice(0, 2000),
      data.stack?.slice(0, 10000),
      data.source,
      JSON.stringify(data.context || {}),
      data.userId || null,
      data.url?.slice(0, 2000),
      data.userAgent?.slice(0, 500),
      data.ipAddress,
    ]
  );
  return result.rows[0];
}

export async function getErrorLogs(opts: {
  severity?: string;
  source?: string;
  limit: number;
}) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (opts.severity) {
    conditions.push(`severity = $${paramIdx++}`);
    params.push(opts.severity);
  }
  if (opts.source) {
    conditions.push(`source = $${paramIdx++}`);
    params.push(opts.source);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(opts.limit);

  const result = await query(
    `SELECT * FROM error_logs ${where} ORDER BY created_at DESC LIMIT $${paramIdx}`,
    params
  );
  return result.rows.map(mapErrorRow);
}

export async function getErrorStats() {
  const result = await query(`
    SELECT
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS last_24h,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS last_7d,
      COUNT(*) FILTER (WHERE severity = 'error' AND created_at > NOW() - INTERVAL '24 hours') AS errors_24h,
      COUNT(*) FILTER (WHERE severity = 'fatal' AND created_at > NOW() - INTERVAL '24 hours') AS fatal_24h
    FROM error_logs
  `);
  return result.rows[0];
}

function mapErrorRow(row: pg.QueryResultRow) {
  return {
    id: row.id,
    severity: row.severity,
    message: row.message,
    stack: row.stack,
    source: row.source,
    context: row.context,
    userId: row.user_id,
    url: row.url,
    userAgent: row.user_agent,
    ipAddress: row.ip_address,
    createdAt: row.created_at,
  };
}
