/**
 * Subdomain detection utilities
 *
 * Detects if the app is running on admin subdomain (adm. or admin.)
 * to show different interfaces for admin vs members
 */

export type AppMode = 'admin' | 'member' | 'shop'

/**
 * Known app subdomains (first label). Used when swapping host labels.
 * "admin" still detects as admin mode, but canonical public host is always "adm"
 * nginx 301s admin.* to adm.*, avoiding filters that block the "admin" label.
 */
const KNOWN_APP_SUBDOMAINS = new Set([
  'adm',
  'admin',
  'club',
  'shop',
  'www',
  'api',
  'analytics',
  'radio',
])

/**
 * Get the current subdomain from the hostname
 */
export function getSubdomain(): string {
  const hostname = window.location.hostname

  // Handle localhost (no subdomain)
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // Check for query param override in development
    const params = new URLSearchParams(window.location.search)
    return params.get('subdomain') || ''
  }

  // Get first part of hostname
  const parts = hostname.split('.')
  if (parts.length >= 2) {
    return parts[0].toLowerCase()
  }

  return ''
}

/**
 * Check if running on admin subdomain
 */
export function isAdminSubdomain(): boolean {
  const subdomain = getSubdomain()
  return subdomain === 'adm' || subdomain === 'admin'
}

/**
 * Whether we are on the store subdomain.
 */
export function isShopSubdomain(): boolean {
  return getSubdomain() === 'shop'
}

/**
 * Get the current app mode based on subdomain
 */
export function getAppMode(): AppMode {
  if (isAdminSubdomain()) return 'admin'
  if (isShopSubdomain()) return 'shop'
  return 'member'
}

/**
 * Absolute store URL; on localhost it falls back to ?subdomain=shop.
 */
export function getShopUrl(): string {
  const hostname = window.location.hostname
  const protocol = window.location.protocol
  const port = window.location.port ? `:${window.location.port}` : ''

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}${port}?subdomain=shop`
  }

  const parts = hostname.split('.')
  if (parts.length >= 2) {
    const currentSub = parts[0].toLowerCase()
    if (KNOWN_APP_SUBDOMAINS.has(currentSub)) {
      parts[0] = 'shop'
    } else {
      parts.unshift('shop')
    }
  }
  return `${protocol}//${parts.join('.')}${port}`
}

/**
 * Get the appropriate redirect path after login based on role and app mode
 *
 * Role System:
 * - 'admin': Can access /admin on any subdomain
 * - 'seller': Can access /pdv on any subdomain
 * - 'member': Can only access /membro on member subdomain
 *
 * Note: admin/seller do NOT need membership (plan). member needs active subscription.
 */
export function getLoginRedirectPath(role: string | null, appMode: AppMode): string {
  // No role (error or user not found) - send to access denied
  if (!role) {
    return '/acesso-negado'
  }

  if (appMode === 'admin') {
    // On admin subdomain
    if (role === 'admin') return '/admin'
    if (role === 'seller') return '/pdv'
    // Members shouldn't be on admin subdomain - show access denied
    return '/acesso-negado'
  }

  // On member subdomain
  if (role === 'admin') return '/admin'
  if (role === 'seller') return '/pdv'
  return '/membro'
}

/**
 * Check if a role is allowed on the current subdomain
 */
export function isRoleAllowedOnSubdomain(role: string | null, appMode: AppMode): boolean {
  if (appMode === 'admin') {
    // Only admin and seller allowed on admin subdomain
    return role === 'admin' || role === 'seller'
  }

  // Everyone allowed on member subdomain
  return true
}

/**
 * Get URL for a different subdomain (for cross-linking).
 * The canonical admin host is `adm.*`, not `admin.*`; see the nginx redirect.
 */
export function getSubdomainUrl(targetSubdomain: 'admin' | 'member'): string {
  const hostname = window.location.hostname
  const protocol = window.location.protocol
  const port = window.location.port ? `:${window.location.port}` : ''

  // Handle localhost
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    const subdParam = targetSubdomain === 'admin' ? 'adm' : ''
    return subdParam
      ? `${protocol}//${hostname}${port}?subdomain=${subdParam}`
      : `${protocol}//${hostname}${port}`
  }

  // Production domains, including the geekpoptoys mirror
  const parts = hostname.split('.')

  if (parts.length >= 2) {
    const currentSub = parts[0].toLowerCase()
    if (KNOWN_APP_SUBDOMAINS.has(currentSub)) {
      parts[0] = targetSubdomain === 'admin' ? 'adm' : 'club'
    } else {
      parts.unshift(targetSubdomain === 'admin' ? 'adm' : 'club')
    }
  }

  return `${protocol}//${parts.join('.')}${port}`
}

// ─── Canonical domain for SEO ────────────────────────────────────────────────

/**
 * Canonical origin per app, **fixed** and independent of the host in use.
 *
 * The two domains are full mirrors: the same subdomains answer on both. Google
 * reads that as duplicate content and splits ranking authority between them
 * unless one is declared canonical.
 *
 * Hence these cannot derive from `window.location.origin`: doing so makes each
 * mirror declare itself canonical, which is exactly the tie to avoid. Visitors
 * arriving through the mirror browse normally; only the canonical points away.
 *
 * The shop settles on geekpoptoys, where the audience arrives and which matches
 * the wordmark; the club stays on geeketoys, the primary name on the
 * certificate and the infrastructure.
 */
export const CANONICAL_ORIGINS = {
  shop: 'https://shop.geekpoptoys.com.br',
  club: 'https://club.geeketoys.com.br',
} as const

/** Public URL encoded in the membership QR so any phone camera can open it. */
export function getMemberVerifyUrl(memberId: string): string {
  return `${CANONICAL_ORIGINS.club}/verificar/${memberId}`
}

/** Canonical origin of the current app, used by canonical and og:url. */
export function getCanonicalOrigin(): string {
  return getAppMode() === 'shop' ? CANONICAL_ORIGINS.shop : CANONICAL_ORIGINS.club
}
