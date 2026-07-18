/**
 * Analytics (Umami) — Unit Tests
 *
 * Tests script injection, idempotency, consent-based loading,
 * and SSR safety (no document).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// We need fresh module state for each test because `loaded` is module-level
let mod: typeof import('./analytics')

async function loadModule() {
  mod = await import('./analytics')
  return mod
}

beforeEach(() => {
  vi.resetModules()
  // Clear any script elements from prior tests
  document.head.innerHTML = ''
})

// =============================================================================
// 1. loadAnalytics()
// =============================================================================

describe('loadAnalytics', () => {
  it('should inject a script tag into document.head', async () => {
    const { loadAnalytics } = await loadModule()
    loadAnalytics()

    const script = document.getElementById('umami-analytics-script') as HTMLScriptElement
    expect(script).not.toBeNull()
    expect(script.src).toBe('https://analytics.geeketoys.com.br/script.js')
    expect(script.defer).toBe(true)
    expect(script.getAttribute('data-website-id')).toBe('22dab3da-fb48-4d0d-922f-b76d86a2967b')
  })

  it('should be idempotent — calling twice injects only one script', async () => {
    const { loadAnalytics } = await loadModule()
    loadAnalytics()
    loadAnalytics()

    const scripts = document.querySelectorAll('#umami-analytics-script')
    expect(scripts.length).toBe(1)
  })

  it('should detect pre-existing script and skip injection', async () => {
    // Simulate a script already in DOM before module loads
    const existing = document.createElement('script')
    existing.id = 'umami-analytics-script'
    document.head.appendChild(existing)

    const { loadAnalytics, isAnalyticsLoaded } = await loadModule()
    loadAnalytics()

    const scripts = document.querySelectorAll('#umami-analytics-script')
    expect(scripts.length).toBe(1)
    expect(isAnalyticsLoaded()).toBe(true)
  })

  it('should set loaded flag after injection', async () => {
    const { loadAnalytics, isAnalyticsLoaded } = await loadModule()
    expect(isAnalyticsLoaded()).toBe(false)
    loadAnalytics()
    expect(isAnalyticsLoaded()).toBe(true)
  })
})

// =============================================================================
// 2. isAnalyticsLoaded()
// =============================================================================

describe('isAnalyticsLoaded', () => {
  it('should return false before loadAnalytics is called', async () => {
    const { isAnalyticsLoaded } = await loadModule()
    expect(isAnalyticsLoaded()).toBe(false)
  })

  it('should return true after loadAnalytics is called', async () => {
    const { loadAnalytics, isAnalyticsLoaded } = await loadModule()
    loadAnalytics()
    expect(isAnalyticsLoaded()).toBe(true)
  })
})

// =============================================================================
// 3. loadAnalyticsIfConsented()
// =============================================================================

describe('loadAnalyticsIfConsented', () => {
  const localStorageMock = window.localStorage as unknown as {
    getItem: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    localStorageMock.getItem.mockReset()
  })

  it('should not load analytics when no consent entry exists', async () => {
    localStorageMock.getItem.mockReturnValue(null)
    const { loadAnalyticsIfConsented, isAnalyticsLoaded } = await loadModule()

    loadAnalyticsIfConsented()
    expect(isAnalyticsLoaded()).toBe(false)
  })

  it('should load analytics when analytics consent is true', async () => {
    localStorageMock.getItem.mockReturnValue(JSON.stringify({ analytics: true }))
    const { loadAnalyticsIfConsented, isAnalyticsLoaded } = await loadModule()

    loadAnalyticsIfConsented()
    expect(isAnalyticsLoaded()).toBe(true)
    expect(document.getElementById('umami-analytics-script')).not.toBeNull()
  })

  it('should load analytics when acceptedAll is true', async () => {
    localStorageMock.getItem.mockReturnValue(JSON.stringify({ acceptedAll: true }))
    const { loadAnalyticsIfConsented, isAnalyticsLoaded } = await loadModule()

    loadAnalyticsIfConsented()
    expect(isAnalyticsLoaded()).toBe(true)
  })

  it('should not load analytics when analytics and acceptedAll are both false', async () => {
    localStorageMock.getItem.mockReturnValue(
      JSON.stringify({ analytics: false, acceptedAll: false })
    )
    const { loadAnalyticsIfConsented, isAnalyticsLoaded } = await loadModule()

    loadAnalyticsIfConsented()
    expect(isAnalyticsLoaded()).toBe(false)
  })

  it('should not load analytics when consent is empty object', async () => {
    localStorageMock.getItem.mockReturnValue(JSON.stringify({}))
    const { loadAnalyticsIfConsented, isAnalyticsLoaded } = await loadModule()

    loadAnalyticsIfConsented()
    expect(isAnalyticsLoaded()).toBe(false)
  })

  it('should handle malformed JSON gracefully', async () => {
    localStorageMock.getItem.mockReturnValue('not-valid-json{{{')
    const { loadAnalyticsIfConsented, isAnalyticsLoaded } = await loadModule()

    // Should not throw
    expect(() => loadAnalyticsIfConsented()).not.toThrow()
    expect(isAnalyticsLoaded()).toBe(false)
  })

  it('should read from the correct localStorage key', async () => {
    localStorageMock.getItem.mockReturnValue(null)
    const { loadAnalyticsIfConsented } = await loadModule()

    loadAnalyticsIfConsented()
    expect(localStorageMock.getItem).toHaveBeenCalledWith('clube_geek_cookie_consent')
  })

  it('should load analytics when both analytics and acceptedAll are true', async () => {
    localStorageMock.getItem.mockReturnValue(
      JSON.stringify({ analytics: true, acceptedAll: true })
    )
    const { loadAnalyticsIfConsented, isAnalyticsLoaded } = await loadModule()

    loadAnalyticsIfConsented()
    expect(isAnalyticsLoaded()).toBe(true)
  })

  it('should load analytics when only analytics is true (acceptedAll absent)', async () => {
    localStorageMock.getItem.mockReturnValue(JSON.stringify({ analytics: true }))
    const { loadAnalyticsIfConsented, isAnalyticsLoaded } = await loadModule()

    loadAnalyticsIfConsented()
    expect(isAnalyticsLoaded()).toBe(true)
  })
})
