/**
 * Analytics loader (Umami).
 *
 * Loaded dynamically AFTER the user consents to analytics cookies (LGPD compliance).
 * Idempotent: calling loadAnalytics() multiple times only injects the script once.
 */

const ANALYTICS_SCRIPT_URL = 'https://analytics.geeketoys.com.br/script.js'
const WEBSITE_ID = '22dab3da-fb48-4d0d-922f-b76d86a2967b'
const SCRIPT_ID = 'umami-analytics-script'

let loaded = false

export function loadAnalytics(): void {
  if (loaded) return
  if (typeof document === 'undefined') return
  if (document.getElementById(SCRIPT_ID)) {
    loaded = true
    return
  }
  const s = document.createElement('script')
  s.id = SCRIPT_ID
  s.defer = true
  s.src = ANALYTICS_SCRIPT_URL
  s.setAttribute('data-website-id', WEBSITE_ID)
  document.head.appendChild(s)
  loaded = true
}

export function isAnalyticsLoaded(): boolean {
  return loaded
}

/**
 * Reads the cookie consent from localStorage and loads analytics if previously accepted.
 * Call this on app boot.
 */
const CONSENT_KEY = 'clube_geek_cookie_consent'

export function loadAnalyticsIfConsented(): void {
  try {
    const raw = localStorage.getItem(CONSENT_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as { analytics?: boolean; acceptedAll?: boolean }
    if (parsed?.analytics || parsed?.acceptedAll) {
      loadAnalytics()
    }
  } catch {
    // Malformed entry — ignore
  }
}
