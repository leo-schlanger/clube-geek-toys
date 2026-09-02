import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Pagar.me client — the browser half of the payment flow.
 *
 * What these protect, ordered by what a regression costs:
 *
 *  1. **The card goes nowhere near our server.** The tokenization request must
 *     hit `api.pagar.me` with the public key in the query string and **no**
 *     authorization header — Pagar.me refuses the call if one is present, and a
 *     stray `Authorization` would also mean our session cookie riding along
 *     with a PAN.
 *  2. Luhn and expiry are checked locally, so an obvious typo becomes "confira
 *     o número" instead of a round-trip and a "recusado".
 *  3. The instalment ceiling matches the server's, or the checkout offers a
 *     split the charge will refuse.
 *  4. A failed config fetch is **not** cached: the next caller retries instead
 *     of being stuck with a checkout that believes payments are switched off.
 */

vi.mock('./api-client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  API_URL: 'http://localhost:3001',
}))
vi.mock('./logger', () => ({
  paymentLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { api } from './api-client'
import {
  CardTokenError,
  createCardToken,
  formatCardNumber,
  formatExpiry,
  getPaymentConfig,
  guessCardBrand,
  installmentOptions,
  isFutureExpiry,
  isPlausibleCardNumber,
  resetPaymentConfigCache,
} from './pagarme'

const mockedApi = vi.mocked(api)

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

beforeEach(() => {
  vi.clearAllMocks()
  resetPaymentConfigCache()
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── Tokenization ────────────────────────────────────────────────────────────

describe('createCardToken', () => {
  const card = {
    number: '4111 1111 1111 1111',
    holderName: 'ana souza',
    holderDocument: '529.982.247-25',
    expMonth: '12',
    expYear: '30',
    cvv: '123',
  }

  it('posts the card straight to Pagar.me, with the public key and no auth header', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: 'token_abc' }))

    await expect(createCardToken(card, 'pk_test_1')).resolves.toBe('token_abc')

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.pagar.me/core/v5/tokens?appId=pk_test_1')

    // The one header Pagar.me permits. Anything else — our cookie, a bearer —
    // and the request is refused; it would also be a PAN leaving with a session.
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.stringify(init.headers)).not.toMatch(/[Aa]uthorization|[Cc]ookie/)
    expect(init.method).toBe('POST')
  })

  it('normalises what the customer typed', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: 'token_abc' }))

    await createCardToken(card, 'pk_test_1')

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string)
    expect(body.card).toMatchObject({
      number: '4111111111111111',
      holder_name: 'ANA SOUZA',
      holder_document: '52998224725',
      exp_month: 12,
      // "30" is 2030. A card cannot be a century old, and every expiry is ahead.
      exp_year: 2030,
      cvv: '123',
    })
    expect(body.type).toBe('card')
  })

  it('names the field the provider blamed, in Portuguese', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ errors: { 'card.cvv': ['is invalid'] } }, false, 422)
    )

    await expect(createCardToken(card, 'pk_test_1')).rejects.toThrow(/código de segurança/)
  })

  it('refuses to send anything without a public key', async () => {
    await expect(createCardToken(card, '')).rejects.toBeInstanceOf(CardTokenError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('turns a network failure into something a customer can read', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNRESET'))

    await expect(createCardToken(card, 'pk_test_1')).rejects.toThrow(/conexão/)
  })

  it('fails loudly when the provider answers 200 with no token', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}))

    await expect(createCardToken(card, 'pk_test_1')).rejects.toThrow(/token/)
  })
})

// ─── Config ──────────────────────────────────────────────────────────────────

describe('getPaymentConfig', () => {
  const config = {
    provider: 'pagarme' as const,
    publicKey: 'pk_test_1',
    configured: true,
    maxInstallments: 6,
    minInstallmentAmount: 20,
    pixExpiresIn: 3600,
  }

  it('fetches once and shares the promise', async () => {
    mockedApi.get.mockResolvedValue({ data: config, status: 200 })

    const [a, b] = await Promise.all([getPaymentConfig(), getPaymentConfig()])

    expect(a).toEqual(config)
    expect(b).toEqual(config)
    expect(mockedApi.get).toHaveBeenCalledTimes(1)
  })

  /**
   * A cached failure would leave the whole session believing card payment is
   * off, over one blip on page load.
   */
  it('does not cache a failure', async () => {
    mockedApi.get.mockResolvedValueOnce({ error: 'boom', status: 500 })
    const first = await getPaymentConfig()
    expect(first.configured).toBe(false)

    mockedApi.get.mockResolvedValueOnce({ data: config, status: 200 })
    await expect(getPaymentConfig()).resolves.toEqual(config)
  })
})

// ─── Instalments ─────────────────────────────────────────────────────────────

describe('installmentOptions', () => {
  const config = { maxInstallments: 6, minInstallmentAmount: 20 }

  it('never offers a split below the minimum instalment', () => {
    // R$ 50 / 20 = 2 whole instalments, not 6.
    expect(installmentOptions(50, config).map((o) => o.installments)).toEqual([1, 2])
  })

  it('caps at the configured maximum', () => {
    expect(installmentOptions(1000, config)).toHaveLength(6)
  })

  it('always offers at least one, even for a cheap item', () => {
    expect(installmentOptions(5, config)).toEqual([
      { installments: 1, amount: 5, interestFree: true },
    ])
  })

  it('divides to the cent', () => {
    const [, second] = installmentOptions(100, config)
    expect(second).toEqual({ installments: 2, amount: 50, interestFree: true })
  })
})

// ─── Local validation ────────────────────────────────────────────────────────

describe('isPlausibleCardNumber', () => {
  it.each([
    ['Visa', '4111 1111 1111 1111'],
    ['Mastercard', '5555 5555 5555 4444'],
    ['Amex', '3782 822463 10005'],
  ])('accepts a valid %s', (_label, number) => {
    expect(isPlausibleCardNumber(number)).toBe(true)
  })

  it.each([
    ['um dígito trocado', '4111 1111 1111 1112'],
    ['curto demais', '4111 1111'],
    ['vazio', ''],
  ])('rejects %s', (_label, number) => {
    expect(isPlausibleCardNumber(number)).toBe(false)
  })
})

describe('isFutureExpiry', () => {
  it('accepts a month still ahead', () => {
    const year = String(new Date().getFullYear() + 2).slice(2)
    expect(isFutureExpiry('12', year)).toBe(true)
  })

  /** A card is valid through the last day of its month, not the first. */
  it('accepts the current month', () => {
    const now = new Date()
    expect(
      isFutureExpiry(String(now.getMonth() + 1), String(now.getFullYear()).slice(2))
    ).toBe(true)
  })

  it.each([
    ['mês passado', '01', '20'],
    ['mês inválido', '13', '30'],
    ['vazio', '', ''],
  ])('rejects %s', (_label, month, year) => {
    expect(isFutureExpiry(month, year)).toBe(false)
  })
})

// ─── Display helpers ─────────────────────────────────────────────────────────

describe('formatCardNumber', () => {
  it('groups in fours', () => {
    expect(formatCardNumber('4111111111111111')).toBe('4111 1111 1111 1111')
  })

  /** Amex is 4-6-5, and grouping it in fours reads as a typo to the customer. */
  it('uses the Amex grouping for Amex', () => {
    expect(formatCardNumber('378282246310005')).toBe('3782 822463 10005')
  })
})

describe('formatExpiry', () => {
  it('inserts the slash as it is typed', () => {
    expect(formatExpiry('1')).toBe('1')
    expect(formatExpiry('12')).toBe('12')
    expect(formatExpiry('1230')).toBe('12/30')
  })
})

describe('guessCardBrand', () => {
  it.each([
    ['4111111111111111', 'visa'],
    ['5555555555554444', 'mastercard'],
    ['378282246310005', 'amex'],
    ['6362970000457013', 'elo'],
  ])('recognises %s', (number, brand) => {
    expect(guessCardBrand(number)).toBe(brand)
  })

  it('says nothing rather than guessing wrong', () => {
    expect(guessCardBrand('')).toBeNull()
    expect(guessCardBrand('9999')).toBeNull()
  })
})
