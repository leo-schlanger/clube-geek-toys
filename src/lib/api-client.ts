/**
 * API Client — centralized HTTP client with JWT auth
 * Communicates with Express API on VPS (PostgreSQL backend)
 */

import { logger } from './logger'

/**
 * Resolve the API base URL for the current host. The club runs on two mirror
 * domains (geeketoys.com.br and geekpoptoys.com.br); the SPA must talk to the API
 * on the SAME registrable domain it was served from so requests stay same-site
 * (cookies ride, no cross-domain CORS). Falls back to VITE_API_URL on localhost.
 */
function resolveApiUrl(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host.endsWith('geekpoptoys.com.br')) return 'https://api.geekpoptoys.com.br'
    if (host.endsWith('geeketoys.com.br')) return 'https://api.geeketoys.com.br'
  }
  return import.meta.env.VITE_API_URL || 'http://localhost:3001'
}

const API_URL = resolveApiUrl()
const DEFAULT_TIMEOUT = 15000
const MAX_RETRIES = 3
const BASE_DELAY = 1000

// Token storage keys
const ACCESS_TOKEN_KEY = 'clube_geek_access_token'
const REFRESH_TOKEN_KEY = 'clube_geek_refresh_token'

// ============================================
// Token Management
// ============================================

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

// ============================================
// Fetch Helpers
// ============================================

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout: number = DEFAULT_TIMEOUT
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...options,
      // credentials: 'include' lets the httpOnly refresh cookie ride along on /auth/refresh
      // and any future cookie-based endpoints. Required by Wave 5.1 auth refactor.
      credentials: 'include',
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries: number = MAX_RETRIES,
  timeout: number = DEFAULT_TIMEOUT
): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, timeout)

      // 429: respect Retry-After header up to a sane cap, then retry once
      if (response.status === 429 && attempt < maxRetries - 1) {
        const retryAfterHeader = response.headers.get('Retry-After')
        const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 0
        const waitMs = Math.min(Math.max(retryAfter * 1000, BASE_DELAY), 10000)
        await new Promise((resolve) => setTimeout(resolve, waitMs))
        continue
      }

      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response
      }

      lastError = new Error(`Server error: ${response.status}`)
    } catch (error) {
      lastError = error as Error

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`)
      }
    }

    if (attempt < maxRetries - 1) {
      const delay = BASE_DELAY * Math.pow(2, attempt)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError || new Error('Request failed after retries')
}

// ============================================
// Token Refresh
// ============================================

/**
 * Why the outcome is three-valued and not a boolean: only the server saying
 * "this token is not valid" means the session is over. A timeout, an offline
 * phone or a 502 while the API container restarts on deploy used to land in
 * the same branch and wipe the tokens — the session was fine, the network was
 * not, and the customer was thrown back to the login screen. Those now report
 * `transient` and the caller leaves the session alone.
 */
export type RefreshOutcome = 'refreshed' | 'invalid' | 'transient'

let refreshPromise: Promise<RefreshOutcome> | null = null

export async function tryRefreshToken(): Promise<RefreshOutcome> {
  // Prevent concurrent refresh attempts
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    // The refresh token now lives in an httpOnly cookie set by the backend (Wave 5.1).
    // We still send the legacy body fallback if present, so existing sessions during the
    // migration deploy continue to work. Once all clients are on the new flow, the backend
    // can stop accepting the body field.
    const legacyRefreshToken = getRefreshToken()

    try {
      const response = await fetchWithTimeout(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(legacyRefreshToken ? { refreshToken: legacyRefreshToken } : {}),
      })

      if (!response.ok) {
        // 5xx (and anything else that is not a rejection of the credential) is
        // the server having a bad moment, not the session ending.
        if (response.status !== 401 && response.status !== 403 && response.status !== 400) {
          return 'transient'
        }
        clearTokens()
        return 'invalid'
      }

      const data = await response.json()
      // Backend continues to return refreshToken in body for the migration period.
      // Once cookies are the only path, we can drop this and access becomes memory-only.
      setTokens(data.accessToken, data.refreshToken)
      return 'refreshed'
    } catch {
      // Network error or timeout: the tokens we hold may still be perfectly
      // good, so they stay put and the request simply fails.
      return 'transient'
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

// ============================================
// API Client
// ============================================

export interface ApiResponse<T = unknown> {
  data?: T
  error?: string
  /** Internal error code returned by backend (e.g. TOKEN_ALREADY_USED, RECENT_PAYMENT_EXISTS).
   * Use this in place of fragile string matching against `error`. */
  code?: string
  details?: Record<string, unknown>
  status: number
}

/**
 * A failed call, carrying what the backend actually said.
 *
 * `ApiResponse` reports the reason in `error`, but a caller that only reads
 * `result.data` throws it away — which is how a 400 listing the invalid field,
 * an expired session and a 500 all reached the admin panel as the same
 * "Erro ao criar produto". Anything that writes should `unwrapApi` and let this
 * reach the toast.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly details?: Record<string, unknown>

  constructor(message: string, status: number, code?: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/**
 * Returns the payload of a successful call, or throws `ApiError` with the
 * server's own message. `fallback` covers the case where the request succeeded
 * at the HTTP level but came back with no body to work with.
 */
export function unwrapApi<T>(result: ApiResponse<T>, fallback: string): T {
  if (result.error !== undefined || result.data === undefined || result.data === null) {
    throw new ApiError(result.error || fallback, result.status, result.code, result.details)
  }
  return result.data
}

/** Same, for endpoints that answer 204 with no body. */
export function unwrapApiVoid(result: ApiResponse<unknown>, fallback: string): void {
  if (result.error !== undefined) {
    throw new ApiError(result.error || fallback, result.status, result.code, result.details)
  }
}

/**
 * Message to show a person for any thrown error, without leaking a stack or a
 * bare "[object Object]" into a toast.
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message) return error.message
  return fallback
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestInit & { skipAuth?: boolean; noRetry?: boolean; timeoutMs?: number } = {}
): Promise<ApiResponse<T>> {
  const { skipAuth, noRetry, timeoutMs, ...fetchOptions } = options
  const timeout = timeoutMs ?? DEFAULT_TIMEOUT

  // Add auth header
  if (!skipAuth) {
    const token = getAccessToken()
    if (token) {
      fetchOptions.headers = {
        ...fetchOptions.headers,
        Authorization: `Bearer ${token}`,
      }
    }
  }

  // Default content type for JSON only — never set Content-Type on FormData
  // (browser must add the multipart boundary itself).
  if (fetchOptions.body && typeof fetchOptions.body === 'string') {
    fetchOptions.headers = {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    }
  }

  const url = `${API_URL}${path}`

  try {
    const response = noRetry
      ? await fetchWithTimeout(url, fetchOptions, timeout)
      : await fetchWithRetry(url, fetchOptions, MAX_RETRIES, timeout)

    // Handle 401 — try token refresh
    if (response.status === 401 && !skipAuth) {
      const refreshed = await tryRefreshToken()
      if (refreshed === 'refreshed') {
        // Retry with new token
        const newToken = getAccessToken()
        fetchOptions.headers = {
          ...fetchOptions.headers,
          Authorization: `Bearer ${newToken}`,
        }
        const retryResponse = await fetchWithTimeout(url, fetchOptions)
        const retryData = await retryResponse.json().catch(() => null)

        if (!retryResponse.ok) {
          return {
            error: retryData?.error || 'Erro na requisição',
            code: retryData?.code,
            details: retryData?.details,
            status: retryResponse.status,
          }
        }
        return { data: retryData, status: retryResponse.status }
      } else if (refreshed === 'transient') {
        // Could not reach the refresh endpoint. Keep the session and let the
        // caller retry — signing the user out here is how a flaky connection
        // used to turn into "o site me desloga sozinho".
        return { error: 'Não foi possível falar com o servidor. Tente de novo.', status: 503 }
      } else {
        // The server rejected the refresh token — the session is really over.
        window.dispatchEvent(new CustomEvent('auth:logout'))
        return { error: 'Sessão expirada', status: 401 }
      }
    }

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      return {
        error: data?.error || `Erro: ${response.status}`,
        code: data?.code,
        details: data?.details,
        status: response.status,
      }
    }

    return { data, status: response.status }
  } catch (error) {
    logger.error(`API request failed: ${path}`, error)
    let message = 'Erro de comunicação com o servidor.'
    if (error instanceof Error) {
      if (error.name === 'AbortError' || error.message.includes('timeout')) {
        message = 'Tempo limite excedido. Tente novamente.'
      } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        message = 'Sem conexão com a internet. Verifique sua rede e tente novamente.'
      } else {
        message = error.message
      }
    }
    return { error: message, status: 0 }
  }
}

// ============================================
// Convenience Methods
// ============================================

export const api = {
  get: <T = unknown>(path: string, opts?: Parameters<typeof apiRequest>[1]) =>
    apiRequest<T>(path, { method: 'GET', ...opts }),

  post: <T = unknown>(path: string, body?: Record<string, unknown>, opts?: Parameters<typeof apiRequest>[1]) =>
    apiRequest<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      ...opts,
    }),

  patch: <T = unknown>(path: string, body?: Record<string, unknown>, opts?: Parameters<typeof apiRequest>[1]) =>
    apiRequest<T>(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
      ...opts,
    }),

  put: <T = unknown>(path: string, body?: Record<string, unknown>, opts?: Parameters<typeof apiRequest>[1]) =>
    apiRequest<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
      ...opts,
    }),

  delete: <T = unknown>(path: string, opts?: Parameters<typeof apiRequest>[1]) =>
    apiRequest<T>(path, { method: 'DELETE', ...opts }),
}

export { API_URL }
