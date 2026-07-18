/**
 * API Client — Unit Tests
 *
 * Tests for the centralized HTTP client with JWT auth:
 * - Token management (localStorage get/set/clear)
 * - HTTP methods build correct URL, headers, body
 * - Bearer token in Authorization header
 * - 401 triggers token refresh flow
 * - 429 rate-limit with Retry-After
 * - Network errors and timeouts
 * - skipAuth option for public endpoints
 * - Response parsing (JSON extraction)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock logger before importing api-client
vi.mock('./logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
  tryRefreshToken,
  api,
  API_URL,
} from './api-client'

// =============================================================================
// Helpers
// =============================================================================

function mockResponse(
  status: number,
  body: unknown = null,
  headers: Record<string, string> = {}
): Response {
  const headersObj = new Headers(headers)
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: headersObj,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    clone: vi.fn(),
  } as unknown as Response
}

let fetchMock: ReturnType<typeof vi.fn>

// =============================================================================
// Setup
// =============================================================================

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.useFakeTimers({ shouldAdvanceTime: true })
  localStorage.getItem.mockReset()
  localStorage.setItem.mockReset()
  localStorage.removeItem.mockReset()
  localStorage.clear.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

// =============================================================================
// 1. TOKEN MANAGEMENT
// =============================================================================

describe('Token Management', () => {
  it('getAccessToken reads from localStorage', () => {
    localStorage.getItem.mockReturnValue('my-access-token')
    expect(getAccessToken()).toBe('my-access-token')
    expect(localStorage.getItem).toHaveBeenCalledWith('clube_geek_access_token')
  })

  it('getRefreshToken reads from localStorage', () => {
    localStorage.getItem.mockReturnValue('my-refresh-token')
    expect(getRefreshToken()).toBe('my-refresh-token')
    expect(localStorage.getItem).toHaveBeenCalledWith('clube_geek_refresh_token')
  })

  it('getAccessToken returns null when no token stored', () => {
    localStorage.getItem.mockReturnValue(null)
    expect(getAccessToken()).toBeNull()
  })

  it('setTokens stores both tokens in localStorage', () => {
    setTokens('access-123', 'refresh-456')
    expect(localStorage.setItem).toHaveBeenCalledWith('clube_geek_access_token', 'access-123')
    expect(localStorage.setItem).toHaveBeenCalledWith('clube_geek_refresh_token', 'refresh-456')
  })

  it('clearTokens removes both tokens from localStorage', () => {
    clearTokens()
    expect(localStorage.removeItem).toHaveBeenCalledWith('clube_geek_access_token')
    expect(localStorage.removeItem).toHaveBeenCalledWith('clube_geek_refresh_token')
  })
})

// =============================================================================
// 2. HTTP METHODS — URL, headers, body
// =============================================================================

describe('HTTP Methods', () => {
  beforeEach(() => {
    // No token stored
    localStorage.getItem.mockReturnValue(null)
  })

  it('api.get sends GET request to correct URL', async () => {
    fetchMock.mockResolvedValue(mockResponse(200, { ok: true }))

    const result = await api.get('/health')

    expect(result.status).toBe(200)
    expect(result.data).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/health`,
      expect.objectContaining({ method: 'GET', credentials: 'include' })
    )
  })

  it('api.post sends POST with JSON body', async () => {
    fetchMock.mockResolvedValue(mockResponse(200, { id: 1 }))

    await api.post('/items', { name: 'Widget' })

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/items`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Widget' }),
      })
    )
    // Content-Type header should be set for JSON body
    const callArgs = fetchMock.mock.calls[0][1]
    expect(callArgs.headers).toHaveProperty('Content-Type', 'application/json')
  })

  it('api.patch sends PATCH with JSON body', async () => {
    fetchMock.mockResolvedValue(mockResponse(200, { updated: true }))

    await api.patch('/items/1', { name: 'Updated' })

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/items/1`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated' }),
      })
    )
  })

  it('api.put sends PUT with JSON body', async () => {
    fetchMock.mockResolvedValue(mockResponse(200, { replaced: true }))

    await api.put('/items/1', { name: 'Replaced' })

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/items/1`,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ name: 'Replaced' }),
      })
    )
  })

  it('api.delete sends DELETE request', async () => {
    fetchMock.mockResolvedValue(mockResponse(200, { deleted: true }))

    await api.delete('/items/1')

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/items/1`,
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('api.post with no body sends undefined body', async () => {
    fetchMock.mockResolvedValue(mockResponse(200, {}))

    await api.post('/trigger')

    const callArgs = fetchMock.mock.calls[0][1]
    expect(callArgs.body).toBeUndefined()
  })
})

// =============================================================================
// 3. AUTHORIZATION HEADER
// =============================================================================

describe('Authorization Header', () => {
  it('sends Bearer token when access token exists', async () => {
    localStorage.getItem.mockImplementation((key: string) => {
      if (key === 'clube_geek_access_token') return 'jwt-token-123'
      return null
    })
    fetchMock.mockResolvedValue(mockResponse(200, {}))

    await api.get('/protected')

    const callArgs = fetchMock.mock.calls[0][1]
    expect(callArgs.headers).toHaveProperty('Authorization', 'Bearer jwt-token-123')
  })

  it('does not send Authorization when no token stored', async () => {
    localStorage.getItem.mockReturnValue(null)
    fetchMock.mockResolvedValue(mockResponse(200, {}))

    await api.get('/public')

    const callArgs = fetchMock.mock.calls[0][1]
    expect(callArgs.headers?.Authorization).toBeUndefined()
  })

  it('skipAuth omits Authorization even when token exists', async () => {
    localStorage.getItem.mockReturnValue('jwt-token-123')
    fetchMock.mockResolvedValue(mockResponse(200, {}))

    await api.get('/public', { skipAuth: true })

    const callArgs = fetchMock.mock.calls[0][1]
    expect(callArgs.headers?.Authorization).toBeUndefined()
  })
})

// =============================================================================
// 4. RESPONSE PARSING
// =============================================================================

describe('Response Parsing', () => {
  beforeEach(() => {
    localStorage.getItem.mockReturnValue(null)
  })

  it('returns data and status on success', async () => {
    fetchMock.mockResolvedValue(mockResponse(200, { users: [{ id: 1 }] }))

    const result = await api.get('/users')

    expect(result.status).toBe(200)
    expect(result.data).toEqual({ users: [{ id: 1 }] })
    expect(result.error).toBeUndefined()
  })

  it('returns error on 4xx with error body', async () => {
    fetchMock.mockResolvedValue(
      mockResponse(400, { error: 'Bad request', code: 'INVALID_INPUT' })
    )

    const result = await api.post('/items', { bad: 'data' })

    expect(result.status).toBe(400)
    expect(result.error).toBe('Bad request')
    expect(result.code).toBe('INVALID_INPUT')
    expect(result.data).toBeUndefined()
  })

  it('returns generic error when response body has no error field', async () => {
    fetchMock.mockResolvedValue(mockResponse(404, {}))

    const result = await api.get('/notfound')

    expect(result.status).toBe(404)
    expect(result.error).toBe('Erro: 404')
  })

  it('handles response with null JSON body gracefully', async () => {
    const resp = mockResponse(500, null)
    resp.json = vi.fn().mockRejectedValue(new Error('no body'))
    // 500 triggers retry — make all attempts return same
    fetchMock.mockResolvedValue(resp)

    const result = await api.get('/broken', { noRetry: true })

    // json() returns null on catch, so error falls through to generic message
    expect(result.status).toBe(500)
  })
})

// =============================================================================
// 5. TOKEN REFRESH ON 401
// =============================================================================

describe('Token Refresh on 401', () => {
  it('refreshes token and retries request on 401', async () => {
    // First call: access token present, response is 401
    localStorage.getItem.mockImplementation((key: string) => {
      if (key === 'clube_geek_access_token') return 'expired-token'
      if (key === 'clube_geek_refresh_token') return 'valid-refresh'
      return null
    })

    // Call 1: GET /protected -> 401
    // Call 2: POST /auth/refresh -> 200 (refresh success)
    // Call 3: GET /protected (retry) -> 200
    fetchMock
      .mockResolvedValueOnce(mockResponse(401, { error: 'Token expired' }))
      .mockResolvedValueOnce(
        mockResponse(200, { accessToken: 'new-access', refreshToken: 'new-refresh' })
      )
      .mockResolvedValueOnce(mockResponse(200, { data: 'protected content' }))

    const result = await api.get('/protected')

    expect(result.status).toBe(200)
    expect(result.data).toEqual({ data: 'protected content' })
    // Tokens should have been updated
    expect(localStorage.setItem).toHaveBeenCalledWith('clube_geek_access_token', 'new-access')
    expect(localStorage.setItem).toHaveBeenCalledWith('clube_geek_refresh_token', 'new-refresh')
  })

  it('dispatches auth:logout when refresh fails', async () => {
    localStorage.getItem.mockImplementation((key: string) => {
      if (key === 'clube_geek_access_token') return 'expired-token'
      if (key === 'clube_geek_refresh_token') return 'bad-refresh'
      return null
    })

    const logoutSpy = vi.fn()
    window.addEventListener('auth:logout', logoutSpy)

    // Call 1: GET /protected -> 401
    // Call 2: POST /auth/refresh -> 401 (refresh fails)
    fetchMock
      .mockResolvedValueOnce(mockResponse(401, { error: 'Token expired' }))
      .mockResolvedValueOnce(mockResponse(401, { error: 'Refresh expired' }))

    const result = await api.get('/protected')

    expect(result.status).toBe(401)
    expect(result.error).toBe('Sessão expirada')
    expect(logoutSpy).toHaveBeenCalled()

    window.removeEventListener('auth:logout', logoutSpy)
  })

  it('does not attempt refresh when skipAuth is set', async () => {
    localStorage.getItem.mockReturnValue(null)
    fetchMock.mockResolvedValue(mockResponse(401, { error: 'Unauthorized' }))

    const result = await api.get('/public-401', { skipAuth: true })

    expect(result.status).toBe(401)
    expect(result.error).toBe('Unauthorized')
    // Only 1 fetch call, no refresh attempt
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns error when retry after refresh also fails', async () => {
    localStorage.getItem.mockImplementation((key: string) => {
      if (key === 'clube_geek_access_token') return 'expired-token'
      if (key === 'clube_geek_refresh_token') return 'valid-refresh'
      return null
    })

    // Call 1: 401 -> Call 2: refresh ok -> Call 3: retry also fails
    fetchMock
      .mockResolvedValueOnce(mockResponse(401, { error: 'Token expired' }))
      .mockResolvedValueOnce(
        mockResponse(200, { accessToken: 'new-access', refreshToken: 'new-refresh' })
      )
      .mockResolvedValueOnce(mockResponse(403, { error: 'Forbidden', code: 'NO_ACCESS' }))

    const result = await api.get('/admin')

    expect(result.status).toBe(403)
    expect(result.error).toBe('Forbidden')
    expect(result.code).toBe('NO_ACCESS')
  })
})

// =============================================================================
// 6. tryRefreshToken
// =============================================================================

describe('tryRefreshToken', () => {
  it('returns true on successful refresh and stores new tokens', async () => {
    localStorage.getItem.mockImplementation((key: string) => {
      if (key === 'clube_geek_refresh_token') return 'old-refresh'
      return null
    })

    fetchMock.mockResolvedValue(
      mockResponse(200, { accessToken: 'fresh-access', refreshToken: 'fresh-refresh' })
    )

    const result = await tryRefreshToken()

    expect(result).toBe(true)
    expect(localStorage.setItem).toHaveBeenCalledWith('clube_geek_access_token', 'fresh-access')
    expect(localStorage.setItem).toHaveBeenCalledWith('clube_geek_refresh_token', 'fresh-refresh')
  })

  it('returns false and clears tokens on failed refresh', async () => {
    localStorage.getItem.mockReturnValue(null)
    fetchMock.mockResolvedValue(mockResponse(401, { error: 'invalid' }))

    const result = await tryRefreshToken()

    expect(result).toBe(false)
    expect(localStorage.removeItem).toHaveBeenCalledWith('clube_geek_access_token')
  })

  it('returns false and clears tokens on network error', async () => {
    localStorage.getItem.mockReturnValue(null)
    fetchMock.mockRejectedValue(new Error('Network error'))

    const result = await tryRefreshToken()

    expect(result).toBe(false)
    expect(localStorage.removeItem).toHaveBeenCalledWith('clube_geek_access_token')
  })

  it('deduplicates concurrent refresh calls', async () => {
    localStorage.getItem.mockReturnValue('refresh-tok')
    fetchMock.mockResolvedValue(
      mockResponse(200, { accessToken: 'a', refreshToken: 'r' })
    )

    // Fire two concurrent refreshes
    const [r1, r2] = await Promise.all([tryRefreshToken(), tryRefreshToken()])

    expect(r1).toBe(true)
    expect(r2).toBe(true)
    // Only one fetch call — the second piggybacked on the first
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

// =============================================================================
// 7. RATE LIMITING (429)
// =============================================================================

describe('Rate Limiting (429)', () => {
  beforeEach(() => {
    localStorage.getItem.mockReturnValue(null)
  })

  it('retries after 429 with Retry-After header', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(429, null, { 'Retry-After': '1' }))
      .mockResolvedValueOnce(mockResponse(200, { ok: true }))

    const result = await api.get('/rate-limited')

    expect(result.status).toBe(200)
    expect(result.data).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('uses BASE_DELAY when Retry-After is 0', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(429, null, { 'Retry-After': '0' }))
      .mockResolvedValueOnce(mockResponse(200, { ok: true }))

    const result = await api.get('/rate-limited')

    expect(result.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns 429 if all retries exhausted', async () => {
    // All 3 attempts return 429
    fetchMock
      .mockResolvedValueOnce(mockResponse(429, null, { 'Retry-After': '1' }))
      .mockResolvedValueOnce(mockResponse(429, null, { 'Retry-After': '1' }))
      .mockResolvedValueOnce(mockResponse(429, { error: 'Too many requests' }))

    const result = await api.get('/rate-limited')

    // The last 429 is a 4xx so fetchWithRetry returns it; apiRequest parses the error
    expect(result.status).toBe(429)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})

// =============================================================================
// 8. NETWORK ERRORS & TIMEOUTS
// =============================================================================

describe('Network Errors & Timeouts', () => {
  beforeEach(() => {
    localStorage.getItem.mockReturnValue(null)
  })

  it('returns network error message on fetch failure', async () => {
    fetchMock.mockRejectedValue(new Error('Failed to fetch'))

    const result = await api.get('/offline', { noRetry: true })

    expect(result.status).toBe(0)
    expect(result.error).toContain('Sem conexão com a internet')
  })

  it('returns timeout message on AbortError', async () => {
    const abortError = new Error('The operation was aborted')
    abortError.name = 'AbortError'
    fetchMock.mockRejectedValue(abortError)

    const result = await api.get('/slow', { noRetry: true })

    expect(result.status).toBe(0)
    expect(result.error).toContain('Tempo limite excedido')
  })

  it('retries server errors (5xx) with exponential backoff', async () => {
    // First two calls fail with 500, third succeeds
    fetchMock
      .mockResolvedValueOnce(mockResponse(500, null))
      .mockResolvedValueOnce(mockResponse(500, null))
      .mockResolvedValueOnce(mockResponse(200, { recovered: true }))

    const result = await api.get('/flaky')

    expect(result.status).toBe(200)
    expect(result.data).toEqual({ recovered: true })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('throws after all retries exhausted on server error', async () => {
    fetchMock.mockResolvedValue(mockResponse(500, null))

    const result = await api.get('/always-500')

    // After 3 retries, the error is caught by apiRequest
    expect(result.status).toBe(0)
    expect(result.error).toBeDefined()
  })
})

// =============================================================================
// 9. noRetry OPTION
// =============================================================================

describe('noRetry option', () => {
  beforeEach(() => {
    localStorage.getItem.mockReturnValue(null)
  })

  it('does not retry when noRetry is set', async () => {
    fetchMock.mockResolvedValue(mockResponse(500, null))

    const result = await api.get('/no-retry', { noRetry: true })

    // 500 is not ok, falls through to error parsing
    expect(result.status).toBe(500)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

// =============================================================================
// 10. CREDENTIALS
// =============================================================================

describe('Credentials', () => {
  it('always includes credentials: include for cookie support', async () => {
    localStorage.getItem.mockReturnValue(null)
    fetchMock.mockResolvedValue(mockResponse(200, {}))

    await api.get('/any')

    const callArgs = fetchMock.mock.calls[0][1]
    expect(callArgs.credentials).toBe('include')
  })
})

// =============================================================================
// 11. API_URL EXPORT
// =============================================================================

describe('API_URL', () => {
  it('defaults to localhost:3001 when env is not set', () => {
    // In test environment, VITE_API_URL is typically not set
    expect(API_URL).toBe('http://localhost:3001')
  })
})
