/**
 * AuthContext — Unit Tests
 *
 * Tests for the AuthProvider and useAuth hook:
 * - Initial loading state and session restoration
 * - signUp success and error paths
 * - signIn success and error paths
 * - signOut clears tokens and state
 * - signInWithGoogle sets user
 * - refreshUser updates state from server
 * - sendVerificationEmail
 * - useAuth throws outside provider
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'
import type { ReactNode } from 'react'

// =============================================================================
// Mocks
// =============================================================================

vi.mock('../lib/api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
  getAccessToken: vi.fn(),
}))

vi.mock('../lib/logger', () => ({
  authLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock('../hooks/useIdleTimer', () => ({
  useIdleTimer: vi.fn(),
}))

// Import mocked modules so we can inspect calls
import { api, setTokens, clearTokens, getAccessToken } from '../lib/api-client'

// Typed references to mock functions
const mockApi = vi.mocked(api)

// =============================================================================
// Helpers
// =============================================================================

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  role: 'member' as const,
  emailVerified: true,
}

// =============================================================================
// Setup
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks()
  // Default: no existing session
  vi.mocked(getAccessToken).mockReturnValue(null)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// =============================================================================
// 1. INITIAL STATE & SESSION CHECK
// =============================================================================

describe('Initial State', () => {
  it('resolves to loading=false with no user when no token exists', async () => {
    vi.mocked(getAccessToken).mockReturnValue(null)

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.user).toBeNull()
    expect(result.current.role).toBeNull()
    expect(result.current.emailVerified).toBe(false)
  })

  it('restores session from existing token on mount', async () => {
    vi.mocked(getAccessToken).mockReturnValue('existing-token')
    mockApi.get.mockResolvedValue({
      data: {
        id: 'user-1',
        email: 'test@example.com',
        role: 'member',
        emailVerified: true,
      },
      status: 200,
    })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.user).toEqual(mockUser)
    expect(result.current.role).toBe('member')
    expect(result.current.emailVerified).toBe(true)
    expect(mockApi.get).toHaveBeenCalledWith('/auth/me')
  })

  it('clears tokens when /auth/me returns no data', async () => {
    vi.mocked(getAccessToken).mockReturnValue('bad-token')
    mockApi.get.mockResolvedValue({ data: null, status: 401 })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(clearTokens).toHaveBeenCalled()
    expect(result.current.user).toBeNull()
  })

  it('clears tokens when /auth/me throws', async () => {
    vi.mocked(getAccessToken).mockReturnValue('bad-token')
    mockApi.get.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(clearTokens).toHaveBeenCalled()
    expect(result.current.user).toBeNull()
  })
})

// =============================================================================
// 2. SIGN IN
// =============================================================================

describe('signIn', () => {
  it('authenticates successfully and sets user state', async () => {
    mockApi.post.mockResolvedValue({
      data: {
        accessToken: 'access-123',
        refreshToken: 'refresh-456',
        user: mockUser,
      },
      status: 200,
    })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    let signInResult: { success: boolean; error?: string }
    await act(async () => {
      signInResult = await result.current.signIn('test@example.com', 'password123')
    })

    expect(signInResult!.success).toBe(true)
    expect(setTokens).toHaveBeenCalledWith('access-123', 'refresh-456')
    expect(result.current.user).toEqual(mockUser)
    expect(result.current.role).toBe('member')

    expect(mockApi.post).toHaveBeenCalledWith(
      '/auth/login',
      { email: 'test@example.com', password: 'password123' },
      { skipAuth: true }
    )
  })

  it('returns error on failed login', async () => {
    mockApi.post.mockResolvedValue({
      error: 'Credenciais inválidas',
      status: 401,
    })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    let signInResult: { success: boolean; error?: string }
    await act(async () => {
      signInResult = await result.current.signIn('wrong@example.com', 'wrong')
    })

    expect(signInResult!.success).toBe(false)
    expect(signInResult!.error).toBe('Credenciais inválidas')
    expect(result.current.user).toBeNull()
  })

  it('returns generic error on exception', async () => {
    mockApi.post.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    let signInResult: { success: boolean; error?: string }
    await act(async () => {
      signInResult = await result.current.signIn('test@example.com', 'pass')
    })

    expect(signInResult!.success).toBe(false)
    expect(signInResult!.error).toBe('Erro ao fazer login')
  })
})

// =============================================================================
// 3. SIGN UP
// =============================================================================

describe('signUp', () => {
  it('registers successfully and sets user state', async () => {
    mockApi.post.mockResolvedValue({
      data: {
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        user: { ...mockUser, emailVerified: false },
      },
      status: 201,
    })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    let signUpResult: { success: boolean; error?: string; userId?: string }
    await act(async () => {
      signUpResult = await result.current.signUp('new@example.com', 'secure123')
    })

    expect(signUpResult!.success).toBe(true)
    expect(signUpResult!.userId).toBe('user-1')
    expect(setTokens).toHaveBeenCalledWith('new-access', 'new-refresh')
    expect(result.current.user?.email).toBe('test@example.com')

    expect(mockApi.post).toHaveBeenCalledWith(
      '/auth/register',
      { email: 'new@example.com', password: 'secure123' },
      { skipAuth: true }
    )
  })

  it('sends turnstile token when provided', async () => {
    mockApi.post.mockResolvedValue({
      data: {
        accessToken: 'a',
        refreshToken: 'r',
        user: mockUser,
      },
      status: 201,
    })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await act(async () => {
      await result.current.signUp('new@example.com', 'pass', 'turnstile-xyz')
    })

    expect(mockApi.post).toHaveBeenCalledWith(
      '/auth/register',
      { email: 'new@example.com', password: 'pass', turnstileToken: 'turnstile-xyz' },
      { skipAuth: true }
    )
  })

  it('returns "Email já cadastrado" when email taken (409)', async () => {
    mockApi.post.mockResolvedValue({
      error: 'Email already exists',
      code: 'EMAIL_ALREADY_EXISTS',
      status: 409,
    })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    let signUpResult: { success: boolean; error?: string; code?: string }
    await act(async () => {
      signUpResult = await result.current.signUp('taken@example.com', 'pass')
    })

    expect(signUpResult!.success).toBe(false)
    expect(signUpResult!.error).toBe('Email já cadastrado')
    expect(signUpResult!.code).toBe('EMAIL_ALREADY_EXISTS')
  })

  it('returns generic error on exception', async () => {
    mockApi.post.mockRejectedValue(new Error('Server down'))

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    let signUpResult: { success: boolean; error?: string }
    await act(async () => {
      signUpResult = await result.current.signUp('new@example.com', 'pass')
    })

    expect(signUpResult!.success).toBe(false)
    expect(signUpResult!.error).toBe('Erro ao criar conta')
  })

  it('returns server error when not email-taken', async () => {
    mockApi.post.mockResolvedValue({
      error: 'Internal server error',
      status: 500,
    })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    let signUpResult: { success: boolean; error?: string }
    await act(async () => {
      signUpResult = await result.current.signUp('new@example.com', 'pass')
    })

    expect(signUpResult!.success).toBe(false)
    expect(signUpResult!.error).toBe('Internal server error')
  })
})

// =============================================================================
// 4. SIGN OUT
// =============================================================================

describe('signOut', () => {
  it('clears tokens and user state on sign out', async () => {
    // Start with a logged-in user
    vi.mocked(getAccessToken).mockReturnValue('token')
    mockApi.get.mockResolvedValue({ data: mockUser, status: 200 })
    mockApi.post.mockResolvedValue({ status: 200 })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.user).toEqual(mockUser)
    })

    let signOutResult: { success: boolean }
    await act(async () => {
      signOutResult = await result.current.signOut()
    })

    expect(signOutResult!.success).toBe(true)
    expect(clearTokens).toHaveBeenCalled()
    expect(result.current.user).toBeNull()
    expect(result.current.role).toBeNull()
    expect(result.current.emailVerified).toBe(false)
  })

  it('still clears state even when logout API fails', async () => {
    vi.mocked(getAccessToken).mockReturnValue('token')
    mockApi.get.mockResolvedValue({ data: mockUser, status: 200 })
    mockApi.post.mockRejectedValue(new Error('Server error'))

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.user).toEqual(mockUser)
    })

    await act(async () => {
      await result.current.signOut()
    })

    expect(clearTokens).toHaveBeenCalled()
    expect(result.current.user).toBeNull()
  })
})

// =============================================================================
// 5. SIGN IN WITH GOOGLE
// =============================================================================

describe('signInWithGoogle', () => {
  it('sets user state from Google auth data', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    let googleResult: { success: boolean; isNewUser?: boolean; googleName?: string }
    act(() => {
      googleResult = result.current.signInWithGoogle({
        accessToken: 'google-access',
        refreshToken: 'google-refresh',
        user: {
          id: 'g-user',
          email: 'google@example.com',
          role: 'member',
          emailVerified: true,
        },
        isNewUser: true,
        googleName: 'Test User',
      })
    })

    expect(googleResult!.success).toBe(true)
    expect(googleResult!.isNewUser).toBe(true)
    expect(googleResult!.googleName).toBe('Test User')
    expect(setTokens).toHaveBeenCalledWith('google-access', 'google-refresh')
    expect(result.current.user?.email).toBe('google@example.com')
    expect(result.current.emailVerified).toBe(true)
  })

  it('handles existing Google user (not new)', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    let googleResult: { success: boolean; isNewUser?: boolean }
    act(() => {
      googleResult = result.current.signInWithGoogle({
        accessToken: 'a',
        refreshToken: 'r',
        user: {
          id: 'g-user',
          email: 'existing@example.com',
          role: 'member',
          emailVerified: true,
        },
        isNewUser: false,
      })
    })

    expect(googleResult!.success).toBe(true)
    expect(googleResult!.isNewUser).toBe(false)
  })
})

// =============================================================================
// 6. REFRESH USER
// =============================================================================

describe('refreshUser', () => {
  it('updates user state from /auth/me', async () => {
    vi.mocked(getAccessToken).mockReturnValue('token')
    mockApi.get.mockResolvedValue({ data: mockUser, status: 200 })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.user).toEqual(mockUser)
    })

    // Now the user's email got verified on the server
    const updatedUser = { ...mockUser, emailVerified: true }
    mockApi.get.mockResolvedValue({ data: updatedUser, status: 200 })

    await act(async () => {
      await result.current.refreshUser()
    })

    expect(result.current.user).toEqual(updatedUser)
    expect(result.current.emailVerified).toBe(true)
  })

  it('does nothing when no access token', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // getAccessToken returns null (default)
    vi.mocked(getAccessToken).mockReturnValue(null)
    mockApi.get.mockClear()

    await act(async () => {
      await result.current.refreshUser()
    })

    // Should not call the API
    expect(mockApi.get).not.toHaveBeenCalled()
  })

  it('handles API error gracefully', async () => {
    vi.mocked(getAccessToken).mockReturnValue('token')
    mockApi.get.mockResolvedValue({ data: mockUser, status: 200 })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.user).toEqual(mockUser)
    })

    mockApi.get.mockRejectedValueOnce(new Error('Server error'))

    await act(async () => {
      await result.current.refreshUser()
    })

    // User should remain unchanged — no crash
    expect(result.current.user).toEqual(mockUser)
  })
})

// =============================================================================
// 7. SEND VERIFICATION EMAIL
// =============================================================================

describe('sendVerificationEmail', () => {
  it('sends verification email for logged-in unverified user', async () => {
    vi.mocked(getAccessToken).mockReturnValue('token')
    const unverifiedUser = { ...mockUser, emailVerified: false }
    mockApi.get.mockResolvedValue({ data: unverifiedUser, status: 200 })
    mockApi.post.mockResolvedValue({ data: {}, status: 200 })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.user).toEqual(unverifiedUser)
    })

    let emailResult: { success: boolean; error?: string }
    await act(async () => {
      emailResult = await result.current.sendVerificationEmail()
    })

    expect(emailResult!.success).toBe(true)
    expect(mockApi.post).toHaveBeenCalledWith('/auth/send-verification-email', {
      email: 'test@example.com',
      uid: 'user-1',
    })
  })

  it('returns error when no user is logged in', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    let emailResult: { success: boolean; error?: string }
    await act(async () => {
      emailResult = await result.current.sendVerificationEmail()
    })

    expect(emailResult!.success).toBe(false)
    expect(emailResult!.error).toBe('Usuário não autenticado')
  })

  it('returns error when email is already verified', async () => {
    vi.mocked(getAccessToken).mockReturnValue('token')
    mockApi.get.mockResolvedValue({ data: mockUser, status: 200 }) // emailVerified: true

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.user).toEqual(mockUser)
    })

    let emailResult: { success: boolean; error?: string }
    await act(async () => {
      emailResult = await result.current.sendVerificationEmail()
    })

    expect(emailResult!.success).toBe(false)
    expect(emailResult!.error).toBe('Email já verificado')
  })

  it('returns API error on failure', async () => {
    vi.mocked(getAccessToken).mockReturnValue('token')
    const unverifiedUser = { ...mockUser, emailVerified: false }
    mockApi.get.mockResolvedValue({ data: unverifiedUser, status: 200 })
    mockApi.post.mockResolvedValue({ error: 'Rate limit exceeded', status: 429 })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.user).toEqual(unverifiedUser)
    })

    let emailResult: { success: boolean; error?: string }
    await act(async () => {
      emailResult = await result.current.sendVerificationEmail()
    })

    expect(emailResult!.success).toBe(false)
    expect(emailResult!.error).toBe('Rate limit exceeded')
  })

  it('handles thrown exception gracefully', async () => {
    vi.mocked(getAccessToken).mockReturnValue('token')
    const unverifiedUser = { ...mockUser, emailVerified: false }
    mockApi.get.mockResolvedValue({ data: unverifiedUser, status: 200 })
    mockApi.post.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.user).toEqual(unverifiedUser)
    })

    let emailResult: { success: boolean; error?: string }
    await act(async () => {
      emailResult = await result.current.sendVerificationEmail()
    })

    expect(emailResult!.success).toBe(false)
    expect(emailResult!.error).toBe('Network error')
  })
})

// =============================================================================
// 8. useAuth OUTSIDE PROVIDER
// =============================================================================

describe('useAuth outside provider', () => {
  it('throws when used outside AuthProvider', () => {
    // Suppress the expected React error boundary output
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => {
      renderHook(() => useAuth())
    }).toThrow('useAuth deve ser usado dentro de AuthProvider')

    spy.mockRestore()
  })
})

// =============================================================================
// 9. AUTH:LOGOUT EVENT
// =============================================================================

describe('auth:logout event', () => {
  it('clears user state when auth:logout event is dispatched', async () => {
    vi.mocked(getAccessToken).mockReturnValue('token')
    mockApi.get.mockResolvedValue({ data: mockUser, status: 200 })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.user).toEqual(mockUser)
    })

    act(() => {
      window.dispatchEvent(new CustomEvent('auth:logout'))
    })

    expect(clearTokens).toHaveBeenCalled()
    expect(result.current.user).toBeNull()
  })
})
