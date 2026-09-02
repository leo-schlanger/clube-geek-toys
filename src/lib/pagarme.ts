/**
 * Pagar.me — client side.
 *
 * The card never reaches our server. The browser posts it straight to Pagar.me
 * with the **public** key and gets back a single-use `card_token`; only that
 * token is sent to our API. This is what keeps the shop out of PCI scope, and
 * it is why the tokenization call goes to `api.pagar.me` rather than to us.
 *
 * The public key and the instalment rules come from `GET /payment/config`
 * rather than from a build-time variable: a key rotated on the VPS would
 * otherwise stay wrong until the next frontend deploy.
 */

import { api } from './api-client'
import { paymentLogger } from './logger'

const TOKENS_ENDPOINT = 'https://api.pagar.me/core/v5/tokens'

// ─── Config ──────────────────────────────────────────────────────────────────

export interface PaymentConfig {
  provider: 'pagarme'
  publicKey: string | null
  configured: boolean
  maxInstallments: number
  minInstallmentAmount: number
  pixExpiresIn: number
}

const FALLBACK_CONFIG: PaymentConfig = {
  provider: 'pagarme',
  publicKey: null,
  configured: false,
  maxInstallments: 1,
  minInstallmentAmount: 20,
  pixExpiresIn: 3600,
}

let configPromise: Promise<PaymentConfig> | null = null

/**
 * The checkout configuration, fetched once per page load.
 *
 * Cached in a module-level promise so the several components that need it
 * (card form, instalment picker, trust badges) share one request. A failed
 * fetch is not cached: the next caller retries instead of being stuck with a
 * checkout that believes payments are switched off.
 */
export function getPaymentConfig(): Promise<PaymentConfig> {
  if (!configPromise) {
    configPromise = api
      .get<PaymentConfig>('/payments/config')
      .then((result) => {
        if (!result.data) throw new Error(result.error || 'Configuração de pagamento indisponível')
        return result.data
      })
      .catch((err) => {
        paymentLogger.error('Could not load payment config:', err)
        configPromise = null
        return FALLBACK_CONFIG
      })
  }
  return configPromise
}

/** For tests and for a hard refresh after the admin changes a setting. */
export function resetPaymentConfigCache(): void {
  configPromise = null
}

// ─── Instalments ─────────────────────────────────────────────────────────────

export interface InstallmentOption {
  installments: number
  amount: number
  interestFree: boolean
}

/**
 * The splits offered for a total.
 *
 * Computed locally from the config rather than fetched: it is a division, the
 * server applies the same ceiling when it charges, and one fewer round-trip on
 * the checkout is worth more than the symmetry. The server is still the
 * authority — it clamps whatever it is sent.
 */
export function installmentOptions(
  amount: number,
  config: Pick<PaymentConfig, 'maxInstallments' | 'minInstallmentAmount'>
): InstallmentOption[] {
  const byValue = Math.floor(amount / config.minInstallmentAmount)
  const max = Math.max(1, Math.min(config.maxInstallments, byValue || 1))
  return Array.from({ length: max }, (_, i) => {
    const n = i + 1
    return {
      installments: n,
      amount: Math.round((amount / n) * 100) / 100,
      interestFree: true,
    }
  })
}

// ─── Tokenization ────────────────────────────────────────────────────────────

export interface CardInput {
  /** Digits only or spaced — normalised here. */
  number: string
  holderName: string
  /** CPF/CNPJ of the cardholder, digits only or masked. */
  holderDocument: string
  /** 1–12, as typed. */
  expMonth: string
  /** Two or four digits. */
  expYear: string
  cvv: string
}

export class CardTokenError extends Error {
  /** Which field the provider blamed, when it named one. */
  readonly field: string | null

  constructor(message: string, field: string | null = null) {
    super(message)
    this.name = 'CardTokenError'
    this.field = field
  }
}

/** Field names in Pagar.me's error body are English paths; name the visible ones. */
const FIELD_LABELS: Record<string, string> = {
  number: 'número do cartão',
  holder_name: 'nome impresso no cartão',
  holder_document: 'CPF do titular',
  exp_month: 'mês de validade',
  exp_year: 'ano de validade',
  cvv: 'código de segurança',
}

function describeTokenError(body: unknown): CardTokenError {
  const errors = (body as { errors?: Record<string, string[]> } | null)?.errors
  if (errors && typeof errors === 'object') {
    const first = Object.entries(errors)[0]
    if (first) {
      const [path, reasons] = first
      const leaf = path.split('.').pop() ?? path
      const label = FIELD_LABELS[leaf] ?? leaf
      const reason = Array.isArray(reasons) ? reasons[0] : String(reasons)
      return new CardTokenError(`Confira o ${label}: ${reason}`, leaf)
    }
  }
  const message = (body as { message?: string } | null)?.message
  return new CardTokenError(
    message ? `Não foi possível validar o cartão. ${message}` : 'Não foi possível validar o cartão.'
  )
}

/**
 * Two-digit years are what people type; Pagar.me wants four.
 *
 * "30" means 2030, not 1930 — a card cannot be a century old, and every
 * expiry is in the future.
 */
function normaliseYear(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 2) return `20${digits}`
  return digits
}

/**
 * Exchange raw card data for a single-use token, directly with Pagar.me.
 *
 * Deliberately uses `fetch` and not `api`: this request must NOT carry our
 * session cookie or Authorization header, and must NOT go through our server.
 * Pagar.me rejects the call if it carries an authorization header at all —
 * the public key in the query string is the only credential.
 */
export async function createCardToken(card: CardInput, publicKey: string): Promise<string> {
  if (!publicKey) {
    throw new CardTokenError('Pagamento com cartão indisponível no momento.')
  }

  const body = {
    type: 'card',
    card: {
      number: card.number.replace(/\D/g, ''),
      holder_name: card.holderName.trim().toUpperCase(),
      holder_document: card.holderDocument.replace(/\D/g, ''),
      exp_month: Number(card.expMonth.replace(/\D/g, '')),
      exp_year: Number(normaliseYear(card.expYear)),
      cvv: card.cvv.replace(/\D/g, ''),
    },
  }

  let response: Response
  try {
    response = await fetch(`${TOKENS_ENDPOINT}?appId=${encodeURIComponent(publicKey)}`, {
      method: 'POST',
      // Only Content-Type is permitted here; anything else is refused.
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (err) {
    paymentLogger.error('Card tokenization request failed:', err)
    throw new CardTokenError('Não conseguimos falar com a operadora. Verifique sua conexão.')
  }

  const text = await response.text()
  let parsed: unknown = null
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = null
    }
  }

  if (!response.ok) {
    // The body is the provider's; never log it — it echoes the card fields back.
    paymentLogger.error(`Card tokenization rejected (HTTP ${response.status})`)
    throw describeTokenError(parsed)
  }

  const id = (parsed as { id?: string } | null)?.id
  if (!id) {
    throw new CardTokenError('A operadora não devolveu o token do cartão.')
  }
  return id
}

// ─── Display helpers ─────────────────────────────────────────────────────────

/**
 * Brand guessed from the first digits, for the little logo next to the field.
 *
 * Cosmetic only — the authoritative brand comes back on the charge. Getting it
 * wrong shows the wrong icon for a moment; it never affects what is charged.
 */
export function guessCardBrand(number: string): string | null {
  const digits = number.replace(/\D/g, '')
  if (!digits) return null
  if (/^4/.test(digits)) return 'visa'
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'mastercard'
  if (/^(4011|4312|4389|4514|4576|5041|5066|5090|6277|6362|6363|650|651|655)/.test(digits)) {
    return 'elo'
  }
  if (/^3[47]/.test(digits)) return 'amex'
  if (/^(38|60)/.test(digits)) return 'hipercard'
  return null
}

/** Groups the number in fours as it is typed. Amex is 4-6-5, everyone else 4-4-4-4. */
export function formatCardNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 19)
  if (/^3[47]/.test(digits)) {
    return [digits.slice(0, 4), digits.slice(4, 10), digits.slice(10, 15)].filter(Boolean).join(' ')
  }
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim()
}

/** "MM/AA" as it is typed, so the two fields feel like one. */
export function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}/${digits.slice(2)}`
}

/**
 * Luhn check, so an obvious typo is caught before a network round-trip.
 *
 * A number that passes Luhn is not necessarily a real card — only the acquirer
 * knows that. This exists to turn "recusado" into "confira o número".
 */
export function isPlausibleCardNumber(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  if (digits.length < 13 || digits.length > 19) return false

  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i])
    if (double) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    double = !double
  }
  return sum % 10 === 0
}

/** Is "MM/AA" a month that has not passed yet? */
export function isFutureExpiry(month: string, year: string): boolean {
  const m = Number(month.replace(/\D/g, ''))
  const y = Number(normaliseYear(year))
  if (!m || m < 1 || m > 12 || !y) return false
  const now = new Date()
  // A card is valid through the last day of its month.
  const lastDay = new Date(y, m, 0, 23, 59, 59)
  return lastDay.getTime() >= now.getTime()
}
