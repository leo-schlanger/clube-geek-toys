/**
 * Subdomain detection utilities
 *
 * Detects if the app is running on admin subdomain (adm. or admin.)
 * to show different interfaces for admin vs members
 */

export type AppMode = 'admin' | 'member'

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
 * Get the current app mode based on subdomain
 */
export function getAppMode(): AppMode {
  return isAdminSubdomain() ? 'admin' : 'member'
}

/**
 * Get the appropriate redirect path after login based on role and app mode
 */
export function getLoginRedirectPath(role: string | null, appMode: AppMode): string {
  if (appMode === 'admin') {
    // On admin subdomain, always go to admin dashboard
    if (role === 'admin') return '/admin'
    if (role === 'seller') return '/pdv'
    // Members shouldn't be on admin subdomain, but redirect to admin anyway
    // They'll see an access denied message
    return '/admin'
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
 * Get URL for a different subdomain (for cross-linking)
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

  // Handle production domains
  const parts = hostname.split('.')

  if (parts.length >= 2) {
    // Check if first part is already a subdomain
    const currentSub = parts[0].toLowerCase()
    if (currentSub === 'adm' || currentSub === 'admin' || currentSub === 'club' || currentSub === 'www') {
      // Replace existing subdomain
      parts[0] = targetSubdomain === 'admin' ? 'adm' : 'club'
    } else {
      // Add subdomain
      parts.unshift(targetSubdomain === 'admin' ? 'adm' : 'club')
    }
  }

  return `${protocol}//${parts.join('.')}${port}`
}
