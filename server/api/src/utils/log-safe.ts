/**
 * What may reach a log line. The goal is narrow: drop the person, keep the
 * diagnosis — ids, status codes and provider messages all stay.
 */

const CPF_IN_PATH = /^(\/members\/(?:cpf-exists|by-cpf)\/)[^/?]+/;

/** `/members/cpf-exists/<cpf>` → `/members/cpf-exists/:cpf`. Only the logged text changes. */
export function redactLogPath(path: string): string {
  return path.replace(CPF_IN_PATH, '$1:cpf');
}

const PERSONAL_KEYS = new Set([
  'name',
  'email',
  'document',
  'cpf',
  'phones',
  'phone',
  'mobile_phone',
  'home_phone',
  'address',
  'billing_address',
  'shipping',
  'line_1',
  'line_2',
  'zip_code',
  'holder_name',
  'holder_document',
  'birthdate',
  'customer_name',
  'customer_email',
  'payer_name',
  'payer_email',
]);

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const FORMATTED_CPF = /\d{3}\.\d{3}\.\d{3}-\d{2}/g;
const BARE_DOCUMENT = /(?<![\w.])(?:\d{14}|\d{11})(?![\w.])/g;

function scrubText(text: string): string {
  return text.replace(EMAIL, '[email]').replace(FORMATTED_CPF, '[doc]').replace(BARE_DOCUMENT, '[doc]');
}

/** Deep copy with personal fields censored and everything else intact. */
export function scrubForLog(value: unknown): unknown {
  if (typeof value === 'string') return scrubText(value);
  if (Array.isArray(value)) return value.map(scrubForLog);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        PERSONAL_KEYS.has(key.toLowerCase()) ? '[redacted]' : scrubForLog(entry),
      ]),
    );
  }
  return value;
}

/** A provider response as log text: same 800-character cap, without the person. */
export function providerBodyForLog(body: unknown): string | undefined {
  return JSON.stringify(scrubForLog(body))?.slice(0, 800);
}

/** Fields for a log line about a provider order: its ids plus the scrubbed body. */
export function providerOrderForLog(order: {
  id?: string;
  code?: string;
  metadata?: Record<string, string>;
}): Record<string, unknown> {
  return {
    pagarmeOrderId: order.id,
    code: order.code,
    metadata: scrubForLog(order.metadata),
    detail: providerBodyForLog(order),
  };
}
