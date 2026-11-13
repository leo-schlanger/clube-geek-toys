/**
 * Christmas theme window and where it may paint. Pure, so it is tested
 * without mocks; the gate (./index.tsx) feeds it the clock and the URL.
 */

/** [start, end): 13 Nov 2026 to the end of 26 Dec in Rio (UTC-3). */
export const NATAL_WINDOW = {
  start: '2026-11-13T00:00:00Z',
  end: '2026-12-27T03:00:00Z',
} as const

export type SeasonOverride = 'natal' | 'off' | null

export function isNatalActive(
  now: Date,
  override: SeasonOverride = null,
  window: { start: string; end: string } = NATAL_WINDOW
): boolean {
  if (override === 'off') return false
  if (override === 'natal') return true
  const t = now.getTime()
  return t >= Date.parse(window.start) && t < Date.parse(window.end)
}

/** `?season=natal|off` (qa only). Anything else means no override. */
export function parseSeasonOverride(search: string): SeasonOverride {
  const value = new URLSearchParams(search).get('season')
  return value === 'natal' || value === 'off' ? value : null
}

// Decoration only where nothing is being paid or filled in: checkout,
// payment, PIX, order, sign-up, login, tickets, wholesale, PDV and the staff
// panels stay plain. An allowlist, so a new route starts undecorated.
const EXACT = ['/', '/carrinho', '/assinar', '/membro']
const PREFIXES = ['/categoria/', '/produto/']

export function isNatalDecorPath(hostname: string, pathname: string): boolean {
  if (/^(adm|admin)\./.test(hostname)) return false
  const path = pathname.toLowerCase().replace(/\/+$/, '') || '/'
  return EXACT.includes(path) || PREFIXES.some((p) => path.startsWith(p))
}

/** localStorage key for a closed strip; per year and per site. */
export function natalBannerKey(area: 'shop' | 'club'): string {
  return `natal-2026-banner-closed:${area}`
}
