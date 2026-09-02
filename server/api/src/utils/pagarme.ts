/**
 * Pagar.me API v5 (PSP) client.
 *
 * Plain `fetch` rather than an SDK: the official Node package wraps v4, and the
 * v5 surface we need is a handful of REST calls. Authentication is HTTP Basic
 * with the secret key as the username and an empty password.
 *
 * Money crosses this boundary in **centavos** (integers). Every other module in
 * this codebase speaks reais as floats, so the conversion happens here and only
 * here — `toCents` / `fromCents`.
 */

import crypto from 'crypto';
import { env } from '../config/env.js';
import { query } from '../config/database.js';
import { AppError } from '../middleware/error-handler.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type PagarmeChargeStatus =
  | 'pending'
  | 'paid'
  | 'canceled'
  | 'processing'
  | 'failed'
  | 'overpaid'
  | 'underpaid'
  | 'partial_canceled'
  | 'chargedback'
  | 'with_error'
  | 'not_authorized';

export interface PagarmeLastTransaction {
  id?: string;
  transaction_type?: string;
  status?: string;
  success?: boolean;
  /** PIX: the EMV copia-e-cola string. */
  qr_code?: string;
  /** PIX: a hosted PNG of the same code. */
  qr_code_url?: string;
  expires_at?: string;
  installments?: number;
  acquirer_message?: string;
  acquirer_return_code?: string;
  gateway_response?: { code?: string; errors?: { message?: string }[] };
  card?: { brand?: string; last_four_digits?: string; holder_name?: string };
}

export interface PagarmeCharge {
  id: string;
  code?: string;
  status: PagarmeChargeStatus;
  amount: number;
  paid_amount?: number;
  payment_method?: string;
  order?: { id?: string };
  customer?: { id?: string; email?: string; name?: string };
  last_transaction?: PagarmeLastTransaction;
  metadata?: Record<string, string>;
}

export interface PagarmeOrder {
  id: string;
  code?: string;
  amount: number;
  status: string;
  customer?: { id?: string; email?: string; name?: string };
  charges?: PagarmeCharge[];
  metadata?: Record<string, string>;
}

export interface PagarmeSubscription {
  id: string;
  status: string;
  next_billing_at?: string;
  current_cycle?: { start_at?: string; end_at?: string };
  card?: { brand?: string; last_four_digits?: string };
  customer?: { id?: string };
  metadata?: Record<string, string>;
}

export interface PagarmeInvoice {
  id: string;
  status: string;
  amount: number;
  subscription?: { id?: string } | string;
  charge?: PagarmeCharge;
  cycle?: { start_at?: string; end_at?: string };
}

/** Phone split the way Pagar.me wants it. */
export interface PagarmePhone {
  country_code: string;
  area_code: string;
  number: string;
}

export interface PagarmeCustomerInput {
  name: string;
  email: string;
  /** CPF (11) or CNPJ (14), digits only. */
  document: string;
  document_type?: 'CPF' | 'CNPJ' | 'PASSPORT';
  type?: 'individual' | 'company';
  phones?: { mobile_phone?: PagarmePhone; home_phone?: PagarmePhone };
  address?: {
    line_1: string;
    line_2?: string;
    zip_code: string;
    city: string;
    state: string;
    country: string;
  };
  code?: string;
  metadata?: Record<string, string>;
}

export interface PagarmeItemInput {
  amount: number;
  description: string;
  quantity: number;
  code?: string;
}

// ─── Errors ──────────────────────────────────────────────────────────────────

/**
 * A failure that came back from Pagar.me with a body.
 *
 * `userMessage` is already in PT-BR and safe to show a customer; `message`
 * keeps the raw provider text for the logs.
 */
export class PagarmeError extends Error {
  readonly httpStatus: number;
  readonly userMessage: string;
  readonly details: unknown;

  constructor(httpStatus: number, message: string, userMessage: string, details?: unknown) {
    super(message);
    this.name = 'PagarmeError';
    this.httpStatus = httpStatus;
    this.userMessage = userMessage;
    this.details = details;
  }
}

/**
 * Acquirer return codes, mapped to something a buyer can act on.
 *
 * The provider's own text is a mix of English and bank jargon ("Do not honor"),
 * which in a checkout reads as a bug rather than a declined card.
 */
const ACQUIRER_MESSAGE_MAP: Record<string, string> = {
  '51': 'Cartão recusado: saldo ou limite insuficiente.',
  '05': 'Cartão recusado pelo banco emissor. Tente outro cartão.',
  '57': 'Cartão não autorizado para esta compra. Fale com seu banco.',
  '54': 'Cartão expirado. Confira a validade.',
  '82': 'Código de segurança (CVV) incorreto.',
  '14': 'Número do cartão incorreto.',
  '41': 'Cartão bloqueado pelo banco. Use outro cartão.',
  '43': 'Cartão bloqueado pelo banco. Use outro cartão.',
  '62': 'Cartão restrito para este tipo de compra.',
  '78': 'Cartão ainda não desbloqueado. Ative-o no app do banco.',
  '91': 'Banco emissor indisponível no momento. Tente em alguns minutos.',
  '96': 'Falha temporária no processamento. Tente novamente.',
};

/** Antifraude and gateway-level refusals, which carry no acquirer code. */
const STATUS_MESSAGE_MAP: Record<string, string> = {
  not_authorized: 'Pagamento não autorizado pelo banco emissor. Tente outro cartão.',
  failed: 'Não foi possível processar o pagamento. Tente novamente ou use outro cartão.',
  with_error: 'Erro ao processar o pagamento. Tente novamente em alguns minutos.',
  canceled: 'Pagamento cancelado.',
};

/**
 * The message the customer sees for a charge that did not go through.
 *
 * Order of preference: acquirer code (most specific), the charge status, then a
 * generic fallback. The raw `acquirer_message` is never shown — it is English.
 */
export function describeChargeFailure(charge: PagarmeCharge | undefined): string {
  const tx = charge?.last_transaction;
  const code = tx?.acquirer_return_code;
  if (code && ACQUIRER_MESSAGE_MAP[code]) return ACQUIRER_MESSAGE_MAP[code];

  const gatewayError = tx?.gateway_response?.errors?.[0]?.message;
  if (charge?.status && STATUS_MESSAGE_MAP[charge.status]) {
    return STATUS_MESSAGE_MAP[charge.status];
  }
  if (gatewayError) return 'Pagamento recusado. Tente outro cartão ou use PIX.';
  return 'Pagamento recusado. Tente outro cartão ou use PIX.';
}

/** Turns a Pagar.me error body into one PT-BR sentence. */
function buildUserMessage(httpStatus: number, body: unknown): string {
  if (httpStatus === 401 || httpStatus === 403) {
    return 'Pagamento indisponível no momento. Já avisamos a equipe.';
  }
  // `POST /customers/{id}/cards` verifies the card with the issuer before
  // saving it, and answers 412 when that fails — measured against the live
  // account. It happens *before* any charge, so "não foi possível criar a
  // cobrança" would send the customer looking in the wrong place.
  if (httpStatus === 412) {
    return 'Não foi possível validar o cartão. Confira o número, a validade e o CVV, ou use outro cartão.';
  }
  if (httpStatus >= 500) {
    return 'O processador de pagamentos está instável. Tente novamente em alguns minutos.';
  }

  // 422 bodies look like { message, errors: { "field": ["reason", ...] } }
  const errors = (body as { errors?: Record<string, string[]> } | null)?.errors;
  if (errors && typeof errors === 'object') {
    const first = Object.entries(errors)[0];
    if (first) {
      const [field, reasons] = first;
      const reason = Array.isArray(reasons) ? reasons[0] : String(reasons);
      return `Dados de pagamento inválidos (${humanField(field)}): ${reason}`;
    }
  }
  return 'Não foi possível criar a cobrança. Confira os dados e tente novamente.';
}

/** Field paths in the error body are English dotted paths; name the visible ones. */
function humanField(field: string): string {
  const leaf = field.split('.').pop() ?? field;
  const map: Record<string, string> = {
    number: 'número do cartão',
    cvv: 'código de segurança',
    exp_month: 'mês de validade',
    exp_year: 'ano de validade',
    holder_name: 'nome no cartão',
    document: 'CPF/CNPJ',
    email: 'e-mail',
    zip_code: 'CEP',
    installments: 'parcelas',
    phones: 'telefone',
  };
  return map[leaf] ?? leaf;
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

export function isPagarmeConfigured(): boolean {
  return Boolean(env.PAGARME_SECRET_KEY);
}

function authorizationHeader(): string {
  const key = env.PAGARME_SECRET_KEY;
  if (!key) {
    throw new AppError(
      503,
      'Pagamentos indisponíveis: a integração com a Pagar.me não está configurada.',
      'PAGARME_NOT_CONFIGURED',
    );
  }
  // Basic auth: secret key as the user, empty password.
  return `Basic ${Buffer.from(`${key}:`).toString('base64')}`;
}

/** 30s ceiling: a hung acquirer must not hold an Express worker forever. */
const REQUEST_TIMEOUT_MS = 30_000;

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  opts: { idempotencyKey?: string } = {},
): Promise<T> {
  const url = `${env.PAGARME_API_URL}${path}`;
  const headers: Record<string, string> = {
    Authorization: authorizationHeader(),
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  // Pagar.me replays the stored response for a repeated key, which is what
  // makes a retry after a timeout safe instead of a second charge.
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const aborted = (err as Error)?.name === 'AbortError';
    throw new PagarmeError(
      504,
      `Pagar.me ${method} ${path} ${aborted ? 'timed out' : 'unreachable'}: ${(err as Error).message}`,
      'Não conseguimos falar com o processador de pagamentos. Tente novamente em instantes.',
    );
  }
  clearTimeout(timer);

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }

  if (!response.ok) {
    const providerMessage =
      (parsed as { message?: string } | null)?.message ?? `HTTP ${response.status}`;
    console.error(
      `[PAGARME] ${method} ${path} → ${response.status}: ${JSON.stringify(parsed)?.slice(0, 800)}`,
    );
    throw new PagarmeError(
      response.status,
      `Pagar.me ${method} ${path}: ${providerMessage}`,
      buildUserMessage(response.status, parsed),
      parsed,
    );
  }

  return parsed as T;
}

// ─── Money ───────────────────────────────────────────────────────────────────

/** Reais (float) → centavos (int). Rounds, so 19.99 never becomes 1998. */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(amount: number): number {
  return Math.round(amount) / 100;
}

// ─── Status mapping ──────────────────────────────────────────────────────────

/**
 * Pagar.me charge status → the four values our `payments.status` check allows.
 *
 * `overpaid` and `underpaid` both count as paid: the money arrived, and the
 * difference is a human matter. `partial_canceled` is a partial refund, which
 * this shop has no concept of — it is treated as refunded, same as Stripe's
 * partial `charge.refunded` was.
 */
export function mapChargeStatus(status: string): 'pending' | 'paid' | 'failed' | 'refunded' {
  switch (status) {
    case 'paid':
    case 'overpaid':
    case 'underpaid':
      return 'paid';
    case 'canceled':
    case 'partial_canceled':
    case 'chargedback':
      return 'refunded';
    case 'failed':
    case 'with_error':
    case 'not_authorized':
      return 'failed';
    case 'pending':
    case 'processing':
    default:
      return 'pending';
  }
}

// ─── Input helpers ───────────────────────────────────────────────────────────

/**
 * Splits a Brazilian phone into Pagar.me's country/area/number triple.
 *
 * Returns null for anything that is not a plausible BR number, because sending
 * a malformed phone fails the whole order with a 422 — and a missing phone
 * only fails when the account requires it.
 */
export function parseBrazilianPhone(raw: string | null | undefined): PagarmePhone | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length > 11) digits = digits.slice(2);
  if (digits.length < 10 || digits.length > 11) return null;
  return {
    country_code: '55',
    area_code: digits.slice(0, 2),
    number: digits.slice(2),
  };
}

/** Digits only, so a masked CPF from the form and a stored one compare equal. */
export function normalizeDocument(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

export function documentType(document: string): 'CPF' | 'CNPJ' {
  return normalizeDocument(document).length > 11 ? 'CNPJ' : 'CPF';
}

/**
 * How many installments we may offer for an amount.
 *
 * Two ceilings: the configured maximum, and a floor per installment so we don't
 * offer "12x de R$ 3,20" on a keychain.
 */
export function maxInstallmentsFor(amount: number): number {
  const byValue = Math.floor(amount / env.PAGARME_MIN_INSTALLMENT_AMOUNT);
  return Math.max(1, Math.min(env.PAGARME_MAX_INSTALLMENTS, byValue || 1));
}

// ─── Customers ───────────────────────────────────────────────────────────────

/**
 * Fill in the fields Pagar.me derives from the document, and normalise it.
 *
 * `type` is **required** — a customer without it is a 422, and that is exactly
 * how the first real order failed: `createCustomer` filled it in, but the
 * inline `customer` object on a PIX order did not, so the two paths disagreed.
 * Every customer object now goes through here, wherever it is sent.
 */
export function normalizeCustomer(input: PagarmeCustomerInput): PagarmeCustomerInput {
  const document = normalizeDocument(input.document);
  const kind = documentType(document);
  return {
    ...input,
    document,
    type: input.type ?? (kind === 'CNPJ' ? 'company' : 'individual'),
    document_type: input.document_type ?? kind,
  };
}

export async function createCustomer(input: PagarmeCustomerInput): Promise<{ id: string }> {
  return request<{ id: string }>('POST', '/customers', normalizeCustomer(input));
}

export async function getCustomer(id: string) {
  return request<{ id: string; email?: string; name?: string }>('GET', `/customers/${id}`);
}

/**
 * The member's Pagar.me customer id, created on first use.
 *
 * Mirrors what `getOrCreateCustomer` did for Stripe, and persists to its own
 * column so the two can coexist while old Stripe subscriptions wind down.
 */
export async function getOrCreatePagarmeCustomer(member: {
  id: string;
  email: string;
  fullName: string;
  document: string;
  phone?: string | null;
  pagarmeCustomerId?: string | null;
}): Promise<string> {
  if (member.pagarmeCustomerId) return member.pagarmeCustomerId;

  const phone = parseBrazilianPhone(member.phone);
  const customer = await createCustomer({
    name: member.fullName,
    email: member.email,
    document: member.document,
    code: member.id,
    phones: phone ? { mobile_phone: phone } : undefined,
    metadata: { memberId: member.id },
  });

  await query('UPDATE members SET pagarme_customer_id = $1 WHERE id = $2', [
    customer.id,
    member.id,
  ]);

  return customer.id;
}

// ─── Cards ───────────────────────────────────────────────────────────────────

export interface PagarmeCard {
  id: string;
  brand?: string;
  last_four_digits?: string;
  holder_name?: string;
  exp_month?: number;
  exp_year?: number;
}

/**
 * Turn a one-shot browser token into a saved card on a customer.
 *
 * **This step is not optional on a PSP account**, which is what we are. The
 * docs are explicit: "Apenas clientes Gateway estão aptos a utilizar o
 * `card_token` na Criação do Pedido, caso seja cliente PSP, recomendamos usar o
 * `card_id`" — and network tokenization only happens if the card is created
 * here first. Charging straight from the token is the Gateway flow, and it was
 * the first shape this integration had.
 *
 * The field is `token`, not `token_id`. `billing_address` is optional at this
 * endpoint even though the *customer* address is required on a PSP order.
 */
/**
 * NOTE: this endpoint **verifies the card with the issuer** before saving it,
 * and answers 412 when that fails — confirmed against the live account with a
 * test PAN. So a bad card is refused here, one step before the charge, and the
 * message the customer sees comes from the 412 branch of `buildUserMessage`.
 */
export async function createCardForCustomer(
  customerId: string,
  token: string,
  billingAddress?: PagarmeCustomerInput['address'],
): Promise<PagarmeCard> {
  return request<PagarmeCard>('POST', `/customers/${customerId}/cards`, {
    token,
    ...(billingAddress ? { billing_address: billingAddress } : {}),
  });
}

// ─── Orders & charges ────────────────────────────────────────────────────────

export interface CreateOrderPayload {
  items: PagarmeItemInput[];
  customer?: PagarmeCustomerInput;
  customer_id?: string;
  payments: Record<string, unknown>[];
  code?: string;
  closed?: boolean;
  metadata?: Record<string, string>;
  antifraud_enabled?: boolean;
}

export async function createOrder(
  payload: CreateOrderPayload,
  opts: { idempotencyKey?: string } = {},
): Promise<PagarmeOrder> {
  // An inline customer needs the same normalisation as one created through
  // `/customers`; forgetting it here is what made the first real PIX 422.
  const body: CreateOrderPayload = payload.customer
    ? { ...payload, customer: normalizeCustomer(payload.customer) }
    : payload;
  return request<PagarmeOrder>('POST', '/orders', body, opts);
}

export async function getOrder(id: string): Promise<PagarmeOrder> {
  return request<PagarmeOrder>('GET', `/orders/${id}`);
}

export async function getCharge(id: string): Promise<PagarmeCharge> {
  return request<PagarmeCharge>('GET', `/charges/${id}`);
}

/**
 * `getCharge` with a very short memory, for the polling paths.
 *
 * The order-confirmation page polls every 4 seconds for up to five minutes, so
 * one buyer watching a PIX QR is ~75 lookups of the same charge. Nothing about
 * a charge changes faster than a few seconds, and the acquirer has rate limits
 * we would rather not discover on a busy Saturday.
 *
 * Cache-on-success only: a failure must be retried, not remembered. Entries are
 * dropped once they expire and whenever the map grows past a sane ceiling —
 * this is a throttle, not a store.
 */
const CHARGE_CACHE_TTL_MS = 3_000;
const CHARGE_CACHE_MAX = 500;
const chargeCache = new Map<string, { at: number; charge: PagarmeCharge }>();

export async function getChargeThrottled(id: string): Promise<PagarmeCharge> {
  const hit = chargeCache.get(id);
  if (hit && Date.now() - hit.at < CHARGE_CACHE_TTL_MS) {
    return hit.charge;
  }

  const charge = await getCharge(id);

  if (chargeCache.size >= CHARGE_CACHE_MAX) {
    const now = Date.now();
    for (const [key, entry] of chargeCache) {
      if (now - entry.at >= CHARGE_CACHE_TTL_MS) chargeCache.delete(key);
    }
    // Everything is still fresh: drop the oldest rather than grow without bound.
    if (chargeCache.size >= CHARGE_CACHE_MAX) {
      const oldest = chargeCache.keys().next().value;
      if (oldest) chargeCache.delete(oldest);
    }
  }

  chargeCache.set(id, { at: Date.now(), charge });
  return charge;
}

/** For tests, and for a process that wants a clean slate. */
export function clearChargeCache(): void {
  chargeCache.clear();
}

/**
 * Refund (or cancel, if not yet captured) a charge.
 *
 * Pagar.me spells both as DELETE /charges/:id — a pending charge is voided, a
 * paid one is refunded. `amount` in centavos makes it partial.
 */
export async function refundCharge(chargeId: string, amountInCents?: number): Promise<PagarmeCharge> {
  return request<PagarmeCharge>(
    'DELETE',
    `/charges/${chargeId}`,
    amountInCents ? { amount: amountInCents } : undefined,
  );
}

// ─── Subscriptions ───────────────────────────────────────────────────────────

export interface CreateSubscriptionPayload {
  customer_id: string;
  payment_method: 'credit_card' | 'pix' | 'boleto';
  /** PSP bills a saved card; `card_token` is the Gateway-only shape. */
  card_id?: string;
  card_token?: string;
  interval: 'day' | 'week' | 'month' | 'year';
  interval_count: number;
  billing_type: 'prepaid' | 'postpaid' | 'exact_day';
  installments?: number;
  statement_descriptor?: string;
  items: { description: string; quantity: number; pricing_scheme: { price: number } }[];
  metadata?: Record<string, string>;
  code?: string;
}

export async function createSubscription(
  payload: CreateSubscriptionPayload,
  opts: { idempotencyKey?: string } = {},
): Promise<PagarmeSubscription> {
  return request<PagarmeSubscription>('POST', '/subscriptions', payload, opts);
}

export async function getSubscription(id: string): Promise<PagarmeSubscription> {
  return request<PagarmeSubscription>('GET', `/subscriptions/${id}`);
}

export async function cancelSubscription(id: string): Promise<PagarmeSubscription> {
  return request<PagarmeSubscription>('DELETE', `/subscriptions/${id}`);
}

/**
 * Swap the card a subscription bills.
 *
 * Used by "update payment method": the member tokenizes a new card in the
 * browser and we point the existing subscription at it, so the billing cycle
 * and the member's expiry date are untouched.
 */
export async function updateSubscriptionCard(
  id: string,
  cardId: string,
): Promise<PagarmeSubscription> {
  return request<PagarmeSubscription>('PATCH', `/subscriptions/${id}/card`, {
    card_id: cardId,
  });
}

// ─── Idempotency keys ────────────────────────────────────────────────────────

/**
 * A stable key for one logical charge attempt.
 *
 * Deterministic on purpose: a retry of the same order at the same amount reuses
 * the stored response instead of charging twice, while a genuinely new attempt
 * (different order, or a different amount after the cart changed) gets its own.
 */
export function idempotencyKeyFor(scope: string, id: string, amountInCents: number): string {
  return crypto
    .createHash('sha256')
    .update(`${scope}:${id}:${amountInCents}`)
    .digest('hex')
    .slice(0, 40);
}
