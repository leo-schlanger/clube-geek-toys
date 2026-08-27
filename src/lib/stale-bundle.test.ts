import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  isStaleBundleError,
  hasAttemptedStaleBundleRecovery,
  recoverFromStaleBundle,
} from './stale-bundle'

describe('isStaleBundleError', () => {
  // One wording per engine. These are the strings that actually reach the
  // ErrorBoundary when a hashed chunk 404s after a deploy — the panel used to
  // show them raw under "Detalhes do erro" and call it a generic failure.
  it.each([
    'Failed to fetch dynamically imported module: https://adm.geeketoys.com.br/assets/ProductsTab-a1b2.js',
    'error loading dynamically imported module',
    'Importing a module script failed.',
    'Unable to preload CSS for /assets/main-x9.css',
    'Loading chunk 42 failed.',
  ])('recognises %s', (message) => {
    expect(isStaleBundleError(new Error(message))).toBe(true)
  })

  it('matches on the error name too, not only the message', () => {
    const err = new Error('boom')
    err.name = 'ChunkLoadError'
    expect(isStaleBundleError(err)).toBe(true)
  })

  it('leaves ordinary failures alone', () => {
    expect(isStaleBundleError(new Error('Cannot read properties of undefined'))).toBe(false)
    expect(isStaleBundleError(new Error('Dados inválidos'))).toBe(false)
    expect(isStaleBundleError(undefined)).toBe(false)
    expect(isStaleBundleError(null)).toBe(false)
    expect(isStaleBundleError({})).toBe(false)
  })

  it('accepts a bare string rejection', () => {
    expect(isStaleBundleError('Failed to fetch dynamically imported module')).toBe(true)
  })
})

describe('recoverFromStaleBundle', () => {
  const unregister = vi.fn().mockResolvedValue(true)
  const reload = vi.fn()
  const realLocation = window.location

  beforeEach(() => {
    // The shared setup replaces Storage with vi.fn()s that never store, so the
    // guard needs a real one to be exercised at all.
    const store = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    })

    unregister.mockClear()
    reload.mockClear()

    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistrations: vi.fn().mockResolvedValue([{ unregister }]),
      },
    })
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue(['workbox-precache-v2']),
      delete: vi.fn().mockResolvedValue(true),
    })
    // jsdom's `location.reload` is non-configurable, so swap the whole object —
    // and put it back in afterEach, because leaving a stub without `origin`
    // behind breaks the origin-keyed sessionStorage this module reads.
    Object.defineProperty(window, 'location', {
      value: { ...realLocation, origin: realLocation.origin, href: realLocation.href, reload },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: realLocation,
      writable: true,
      configurable: true,
    })
    vi.unstubAllGlobals()
  })

  it('drops the worker and its precache before reloading', async () => {
    await recoverFromStaleBundle()

    expect(unregister).toHaveBeenCalled()
    expect(caches.delete).toHaveBeenCalledWith('workbox-precache-v2')
    expect(reload).toHaveBeenCalledOnce()
  })

  // Without the guard the recovery reload could itself land on a stale chunk
  // and reload again — a loop indistinguishable from a dead site.
  it('records the attempt so it cannot loop', async () => {
    expect(hasAttemptedStaleBundleRecovery()).toBe(false)
    await recoverFromStaleBundle()
    expect(hasAttemptedStaleBundleRecovery()).toBe(true)
  })

  it('still reloads when the browser refuses to clear anything', async () => {
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistrations: vi.fn().mockRejectedValue(new Error('denied')),
      },
    })
    vi.stubGlobal('caches', {
      keys: vi.fn().mockRejectedValue(new Error('denied')),
      delete: vi.fn(),
    })

    await recoverFromStaleBundle()

    expect(reload).toHaveBeenCalledOnce()
  })
})
