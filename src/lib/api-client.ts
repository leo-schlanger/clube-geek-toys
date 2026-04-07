/**
 * API Client — centralized HTTP client with JWT auth
 * Replaces Firebase SDK and FirestoreManager
 */

import { logger } from './logger'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
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

let refreshPromise: Promise<boolean> | null = null

async function tryRefreshToken(): Promise<boolean> {
  // Prevent concurrent refresh attempts
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) return false

    try {
      const response = await fetchWithTimeout(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })

      if (!response.ok) {
        clearTokens()
        return false
      }

      const data = await response.json()
      setTokens(data.accessToken, data.refreshToken)
      return true
    } catch {
      clearTokens()
      return false
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
  details?: Record<string, unknown>
  status: number
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestInit & { skipAuth?: boolean; noRetry?: boolean } = {}
): Promise<ApiResponse<T>> {
  const { skipAuth, noRetry, ...fetchOptions } = options

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

  // Default content type for JSON
  if (fetchOptions.body && typeof fetchOptions.body === 'string') {
    fetchOptions.headers = {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    }
  }

  const url = `${API_URL}${path}`

  try {
    const response = noRetry
      ? await fetchWithTimeout(url, fetchOptions)
      : await fetchWithRetry(url, fetchOptions)

    // Handle 401 — try token refresh
    if (response.status === 401 && !skipAuth) {
      const refreshed = await tryRefreshToken()
      if (refreshed) {
        // Retry with new token
        const newToken = getAccessToken()
        fetchOptions.headers = {
          ...fetchOptions.headers,
          Authorization: `Bearer ${newToken}`,
        }
        const retryResponse = await fetchWithTimeout(url, fetchOptions)
        const retryData = await retryResponse.json().catch(() => null)

        if (!retryResponse.ok) {
          return { error: retryData?.error || 'Erro na requisição', status: retryResponse.status }
        }
        return { data: retryData, status: retryResponse.status }
      } else {
        // Refresh failed — force logout
        window.dispatchEvent(new CustomEvent('auth:logout'))
        return { error: 'Sessão expirada', status: 401 }
      }
    }

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      return {
        error: data?.error || `Erro: ${response.status}`,
        details: data?.details,
        status: response.status,
      }
    }

    return { data, status: response.status }
  } catch (error) {
    logger.error(`API request failed: ${path}`, error)
    const message = error instanceof Error
      ? (error.message.includes('timeout') ? 'Tempo limite excedido' : error.message)
      : 'Erro de conexão'
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
