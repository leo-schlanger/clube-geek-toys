import { query } from '../config/database.js';

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
  try {
    await query(
      'INSERT INTO audit_logs (action, user_id, member_id, details) VALUES ($1, $2, $3, $4)',
      [action, userId, memberId ?? null, JSON.stringify(details)]
    );
  } catch (err) {
    console.error('[AUDIT] Failed to write audit log:', err);
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
