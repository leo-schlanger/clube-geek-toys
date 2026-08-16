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
 * (nginx 301 admin.* → adm.* — evita filtros que bloqueiam o label "admin").
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
 * Check if running on the store subdomain (shop.geeketoys.com.br)
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
 * URL absoluta da loja (shop.geeketoys.com.br em produção; ?subdomain=shop no localhost).
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
 * Admin canônico = `adm.*` (não `admin.*`) — ver redirect nginx.
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

  // Handle production domains (incl. mirror geekpoptoys.com.br)
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

// ─── Domínio canônico para SEO ───────────────────────────────────────────────

/**
 * Origem canônica de cada app, **fixa** e independente do domínio acessado.
 *
 * geeketoys.com.br e geekpoptoys.com.br são espelhos completos: os mesmos
 * subdomínios respondem nos dois. Para o Google isso é conteúdo duplicado, e a
 * autoridade de busca se divide entre os dois em vez de somar — a menos que um
 * seja declarado canônico e o outro aponte para ele.
 *
 * Por isso estas constantes não podem sair de `window.location.origin`: derivar
 * do domínio acessado faz cada um se declarar canônico de si mesmo, que é
 * exatamente o empate que se quer evitar. Quem entra pelo espelho continua
 * navegando normalmente; só o canonical aponta para o outro.
 *
 * A loja é canônica em **geekpoptoys** porque é por onde o público chega e é a
 * marca (GeekPop & Toys). O clube segue em geeketoys, que é o nome primário do
 * certificado e da infraestrutura.
 */
export const CANONICAL_ORIGINS = {
  shop: 'https://shop.geekpoptoys.com.br',
  club: 'https://club.geeketoys.com.br',
} as const

/** Origem canônica do app atual; usada no <link rel="canonical"> e no og:url. */
export function getCanonicalOrigin(): string {
  return getAppMode() === 'shop' ? CANONICAL_ORIGINS.shop : CANONICAL_ORIGINS.club
}
