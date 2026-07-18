/**
 * Stripe Client — Unit Tests
 *
 * Tests getStripePromise() and isStripeConfigured(),
 * mocking @stripe/stripe-js and import.meta.env.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @stripe/stripe-js
const mockLoadStripe = vi.fn()
vi.mock('@stripe/stripe-js', () => ({
  loadStripe: (...args: unknown[]) => mockLoadStripe(...args),
}))

// We need to reset modules to test the VITE_STRIPE_PUBLISHABLE_KEY branching
let mod: typeof import('./stripe')

beforeEach(() => {
  vi.resetModules()
  mockLoadStripe.mockReset()
})

// =============================================================================
// 1. With key configured
// =============================================================================

describe('stripe — with key configured', () => {
  beforeEach(() => {
    // Set the env var before importing the module
    import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY = 'pk_test_abc123'
  })

  afterEach(() => {
    delete import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  })

  it('isStripeConfigured should return true', async () => {
    mod = await import('./stripe')
    expect(mod.isStripeConfigured()).toBe(true)
  })

  it('getStripePromise should call loadStripe with key and locale', async () => {
    const fakeStripe = { elements: vi.fn() }
    mockLoadStripe.mockResolvedValue(fakeStripe)

    mod = await import('./stripe')
    const result = await mod.getStripePromise()

    expect(mockLoadStripe).toHaveBeenCalledWith('pk_test_abc123', { locale: 'pt-BR' })
    expect(result).toBe(fakeStripe)
  })

  it('getStripePromise should return cached promise on subsequent calls', async () => {
    const fakeStripe = { elements: vi.fn() }
    mockLoadStripe.mockResolvedValue(fakeStripe)

    mod = await import('./stripe')
    const first = mod.getStripePromise()
    const second = mod.getStripePromise()

    expect(first).toBe(second)
    expect(mockLoadStripe).toHaveBeenCalledTimes(1)
  })
})

// =============================================================================
// 2. Without key configured
// =============================================================================

describe('stripe — without key configured', () => {
  beforeEach(() => {
    delete import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  })

  it('isStripeConfigured should return false', async () => {
    mod = await import('./stripe')
    expect(mod.isStripeConfigured()).toBe(false)
  })

  it('getStripePromise should return null without calling loadStripe', async () => {
    mod = await import('./stripe')
    const result = await mod.getStripePromise()

    expect(result).toBeNull()
    expect(mockLoadStripe).not.toHaveBeenCalled()
  })

  it('getStripePromise should log an error when key is missing', async () => {
    mod = await import('./stripe')
    await mod.getStripePromise()

    expect(console.error).toHaveBeenCalledWith(
      '[Stripe] VITE_STRIPE_PUBLISHABLE_KEY not configured'
    )
  })
})

// =============================================================================
// 3. Empty key (treated as unconfigured)
// =============================================================================

describe('stripe — empty key', () => {
  beforeEach(() => {
    import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY = ''
  })

  afterEach(() => {
    delete import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  })

  it('isStripeConfigured should return false for empty string', async () => {
    mod = await import('./stripe')
    expect(mod.isStripeConfigured()).toBe(false)
  })

  it('getStripePromise should return null for empty string key', async () => {
    mod = await import('./stripe')
    const result = await mod.getStripePromise()
    expect(result).toBeNull()
  })
})
