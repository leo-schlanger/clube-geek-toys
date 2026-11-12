/**
 * Accounts the qa uses against production.
 *
 * Their orders and payments run the real flow (the customer e-mail still goes
 * out, so the qa can check it), but they must not reach the staff: on
 * 08/11/2026 one qa round sent 26 "pedido cancelado"/"PIX aguardando" e-mails
 * to the shop inbox. Entries are full addresses or `@domain`.
 */
export const DEFAULT_TEST_ACCOUNT_EMAILS =
  'e2e-member@geeketoys.com.br,e2e-admin@geeketoys.com.br,e2e-buyer@example.com';

// Read from process.env, not config/env.js: report and e-mail services import
// this, and the Zod env module exits the process on import inside tests.
function entries(): string[] {
  const raw = process.env.TEST_ACCOUNT_EMAILS || DEFAULT_TEST_ACCOUNT_EMAILS;
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 1);
}

export function isTestAccountEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const value = email.trim().toLowerCase();
  return entries().some((entry) => (entry.startsWith('@') ? value.endsWith(entry) : value === entry));
}

/** The same list as `LIKE ANY($n)` patterns, for SQL that must skip these accounts. */
export function testAccountLikePatterns(): string[] {
  return entries().map((entry) => {
    const escaped = entry.replace(/[\\%_]/g, (c) => `\\${c}`);
    return entry.startsWith('@') ? `%${escaped}` : escaped;
  });
}

/** Template variables that name the customer a staff e-mail is about. */
const SUBJECT_EMAIL_VARS = ['customer_email', 'member_email', 'buyer_email'];

/** A staff (`admin-*`) e-mail about a test account. */
export function isStaffNoticeAboutTestAccount(template: string, variables: Record<string, string>): boolean {
  if (!template.startsWith('admin-')) return false;
  return SUBJECT_EMAIL_VARS.some((name) => isTestAccountEmail(variables[name]));
}
