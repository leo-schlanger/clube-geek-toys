/**
 * Recovery for a browser left holding a build that no longer exists.
 *
 * Every admin tab and every page is a `lazy(() => import(...))` chunk, and the
 * deploy rsyncs `dist/` with `--delete`: the moment a new build lands, the
 * hashed chunks of the old one are gone from the server. A browser still on the
 * old `index.html` — served from the service worker precache, or from its own
 * HTTP cache — asks for a file that returns 404 and the import rejects.
 *
 * React turns that into a render error, so it surfaces as the generic
 * "Algo deu errado" screen with a message about a module. Reloading does not
 * help on its own: the service worker hands back the same stale shell, which is
 * how the panel ends up unusable until the site data is cleared by hand.
 *
 * So: recognise that specific failure and clear what is holding the old build.
 */

/**
 * Does this error mean "the JS this page asked for is not there any more"?
 *
 * The wording is browser-specific and none of it is stable enough to match
 * exactly, so match the phrases each engine actually emits.
 */
export function isStaleBundleError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === 'string'
        ? error
        : ''
  if (!message) return false

  return [
    // Chrome / Edge
    'failed to fetch dynamically imported module',
    'error loading dynamically imported module',
    // Firefox
    'error loading dynamically imported module',
    // Safari
    'importing a module script failed',
    'module source uri is not allowed',
    // Vite's preload helper, when the CSS side of a chunk is missing
    'unable to preload css',
    // Bundler-agnostic wording that shows up in older engines
    'loading chunk',
    'chunkloaderror',
  ].some((needle) => message.toLowerCase().includes(needle))
}

/**
 * One attempt per tab. Without this the recovery reload could itself fail on a
 * stale chunk and reload again — a loop that looks exactly like a broken site.
 */
const ATTEMPT_KEY = 'clube_geek_stale_bundle_recovery'

export function hasAttemptedStaleBundleRecovery(): boolean {
  try {
    // Truthy, not `!== null`: a missing key is `null` in a browser but comes
    // back `undefined` from some Storage shims, and treating that as "already
    // tried" would switch the recovery off for good.
    return Boolean(sessionStorage.getItem(ATTEMPT_KEY))
  } catch {
    // Private mode, or storage blocked: treat as "already tried" so we never
    // reload in a loop we cannot remember having started.
    return true
  }
}

function markStaleBundleRecoveryAttempted(): void {
  try {
    sessionStorage.setItem(ATTEMPT_KEY, new Date().toISOString())
  } catch {
    /* nothing else to do — the guard above already fails closed */
  }
}

/**
 * Drops the service worker and its precache, then reloads.
 *
 * Order matters: unregistering first stops the old worker from answering the
 * navigation that the reload is about to make. Both steps are best-effort — a
 * browser that refuses either still gets the reload, which is the part that can
 * actually pick up the new `index.html`.
 */
export async function recoverFromStaleBundle(): Promise<void> {
  markStaleBundleRecoveryAttempted()

  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((r) => r.unregister().catch(() => false)))
    }
  } catch {
    /* keep going — the reload is the part that matters */
  }

  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)))
    }
  } catch {
    /* idem */
  }

  // A reload always revalidates the top-level document, so with the service
  // worker gone this fetches the current index.html from nginx.
  window.location.reload()
}
