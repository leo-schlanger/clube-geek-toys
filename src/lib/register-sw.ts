/**
 * Service worker registration and updates.
 *
 * vite-plugin-pwa's generated `registerSW.js` calls `register()` with no catch,
 * so anything that refuses it (private mode, an extension or antivirus that
 * wraps the call) became an unhandled "Rejected" in `error_logs`. Without a
 * worker the site still works; it only loses the offline shell.
 *
 * Updates: the worker skips waiting and claims open pages (vite.config.ts), so
 * the next full load always runs the new build. A tab that stays open keeps
 * the old JS in memory — its lazy chunks still resolve, the server keeps them
 * 14 days — and swaps to the new build only where a reload loses nothing:
 * never in checkout, payment, PIX, sign-up, login or the staff panels.
 */

const CHECK_EVERY_MS = 60 * 60 * 1000

// Prefixes where a reload could drop a form, a PIX code or a card in flight.
const UNSAFE_PREFIXES = [
  '/checkout',
  '/pagamento',
  '/pedido',
  '/cadastro',
  '/login',
  '/entrar',
  '/recuperar-senha',
  '/redefinir-senha',
  '/verificar-email',
  '/membro',
  '/evento',
  '/ingresso',
  '/ingressos',
  '/perfil',
  '/minhas-compras',
  '/atacado',
  '/pdv',
  '/admin',
]

/** Whether swapping this page for the new build is harmless. */
export function isSafeToReload(hostname: string, pathname: string): boolean {
  // Staff work in long-lived tabs with unsaved edits: they update on next load.
  if (/^(adm|admin)\./.test(hostname)) return false
  const path = pathname.toLowerCase()
  return !UNSAFE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))
}

function safeHere(): boolean {
  return isSafeToReload(window.location.hostname, window.location.pathname)
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return

  // A page loaded with no worker gets its first one through clientsClaim:
  // that is not an update, so only a page that already had one reloads.
  const hadController = !!navigator.serviceWorker.controller
  let updateReady = false

  function applyIfSafe() {
    if (updateReady && safeHere()) window.location.reload()
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || updateReady) return
    updateReady = true
    // Nobody is looking at a hidden tab: swap now.
    if (document.visibilityState === 'hidden') applyIfSafe()
  })

  // SPA navigation into a safe page is the moment to take the new build.
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method].bind(history)
    history[method] = (...args: Parameters<History['pushState']>) => {
      original(...args)
      if (method === 'pushState') applyIfSafe()
    }
  }
  window.addEventListener('popstate', applyIfSafe)

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        const check = () => registration.update().catch(() => {})
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState !== 'visible') return
          check()
          applyIfSafe()
        })
        setInterval(check, CHECK_EVERY_MS)
      })
      .catch(() => {})
  })
}
