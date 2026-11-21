/**
 * How the service worker answers page navigations. Imported by vite.config.ts.
 *
 * The default (`navigateFallback: 'index.html'`) answered every navigation
 * with the precached club shell, also on shop.*: after a few visits the shop
 * page carried the club's <head> (plan JSON-LD, no Store). One worker build
 * serves both hosts, so a fixed fallback cannot be right for both.
 *
 * Instead the page comes from the network, where nginx picks the shell per
 * host (shop.html / index.html), and the last copy of each URL is kept for
 * offline use.
 */
export const PWA_NAVIGATE_FALLBACK = null

export const PWA_PAGES_CACHE = 'pages'

export const pwaNavigationRoute = {
  urlPattern: ({ request }: { request: Request }) => request.mode === 'navigate',
  handler: 'NetworkFirst' as const,
  options: {
    cacheName: PWA_PAGES_CACHE,
    // Slow 4G: past this the cached copy (if any) wins over a blank wait.
    networkTimeoutSeconds: 4,
    expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 7 },
  },
}
