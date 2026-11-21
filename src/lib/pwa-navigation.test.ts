import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PWA_NAVIGATE_FALLBACK, pwaNavigationRoute } from './pwa-navigation'

const config = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf-8')
const req = (mode: string) => ({ request: { mode } as Request })

// One worker build serves club.*, shop.* and adm.*; any fixed shell is wrong
// for one of them (the club <head> showed up on shop pages, qa 21/11/2026).
describe('service worker navigations', () => {
  it('has no fixed navigation fallback', () => {
    expect(PWA_NAVIGATE_FALLBACK).toBeNull()
    expect(config).toMatch(/navigateFallback:\s*PWA_NAVIGATE_FALLBACK/)
    expect(config).not.toMatch(/createHandlerBoundToURL|navigateFallback:\s*['"]/)
  })

  it('takes every page navigation from the network first, nothing else', () => {
    expect(pwaNavigationRoute.handler).toBe('NetworkFirst')
    expect(pwaNavigationRoute.urlPattern(req('navigate'))).toBe(true)
    for (const mode of ['cors', 'no-cors', 'same-origin']) expect(pwaNavigationRoute.urlPattern(req(mode))).toBe(false)
    expect(config).toMatch(/runtimeCaching:\s*\[\s*pwaNavigationRoute,/)
  })

  it('precaches no HTML shell (directoryIndex would answer / with index.html)', () => {
    const globs = config.match(/globPatterns:\s*\[([^\]]*)\]/)
    expect(globs).not.toBeNull()
    expect(globs![1]).not.toMatch(/html/)
  })
})
