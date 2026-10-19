/**
 * Service worker registration, with a catch.
 *
 * vite-plugin-pwa's generated `registerSW.js` calls `register()` with no catch,
 * so anything that refuses it (private mode, an extension or antivirus that
 * wraps the call) became an unhandled "Rejected" in `error_logs`. Without a
 * worker the site still works; it only loses the offline shell.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
  })
}
