import { query } from '../config/database.js';
import { moduleLogger } from '../config/logger.js';

const log = moduleLogger('audit');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Centralized audit log helper.
 * Use for security-sensitive events: auth, payments, role changes, refunds, etc.
 *
 * Failures are caught and logged but never thrown — audit must not break business logic.
 */
export async function auditLog(
  action: string,
  userId: string | null,
  details: Record<string, unknown> = {},
  memberId?: string | null
): Promise<void> {
  // `user_id` is a uuid column, and system actors ("system-reconcile") are not
  // users: inserting one failed the whole row, so automatic cancellations left
  // no trail at all. They go into the details instead.
  const isUser = userId != null && UUID_RE.test(userId);
  const row = isUser || userId == null ? details : { ...details, actor: userId };
  try {
    await query(
      'INSERT INTO audit_logs (action, user_id, member_id, details) VALUES ($1, $2, $3, $4)',
      [action, isUser ? userId : null, memberId ?? null, JSON.stringify(row)]
    );
  } catch (err) {
    log.error({ err }, 'Failed to write audit log');
  }
}

/**
 * Compute a shallow diff of changed fields between two objects.
 * Returns { before, after } containing only fields whose values differ.
 */
export function diffObjects(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const out = { before: {} as Record<string, unknown>, after: {} as Record<string, unknown> };
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    const b = before[k];
    const a = after[k];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      out.before[k] = b;
      out.after[k] = a;
    }
  }
  return out;
}
