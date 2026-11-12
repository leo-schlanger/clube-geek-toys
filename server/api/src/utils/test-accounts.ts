/**
 * Accounts the qa uses against production.
 *
 * Their orders and payments run the real flow (the customer e-mail still goes
 * out, so the qa can check it), but they must not reach the staff: on
 * 08/11/2026 one qa round sent 26 "pedido cancelado"/"PIX aguardando" e-mails
 * to the shop inbox. Entries are full addresses, `@domain`, or globs with `*`
 * (the qa signs up fresh accounts as `e2e-qa-<n>@` and `qa+<n>@` on our domain).
 */
export const DEFAULT_TEST_ACCOUNT_EMAILS =
  'e2e-*@geeketoys.com.br,qa+*@geeketoys.com.br,e2e-buyer@example.com';

// Read from process.env, not config/env.js: report and e-mail services import
// this, and the Zod env module exits the process on import inside tests.
function entries(): string[] {
  const raw = process.env.TEST_ACCOUNT_EMAILS || DEFAULT_TEST_ACCOUNT_EMAILS;
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 1);
}

function globToRegExp(glob: string): RegExp {
  const body = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^@]*');
  return new RegExp(`^${body}$`);
}

function matches(entry: string, value: string): boolean {
  if (entry.startsWith('@')) return value.endsWith(entry);
  if (entry.includes('*')) return globToRegExp(entry).test(value);
  return value === entry;
}

export function isTestAccountEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const value = email.trim().toLowerCase();
  return entries().some((entry) => matches(entry, value));
}

/** The same list as `LIKE ANY($n)` patterns, for SQL that must skip these accounts. */
export function testAccountLikePatterns(): string[] {
  return entries().map((entry) => {
    const escaped = entry.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/\*/g, '%');
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
