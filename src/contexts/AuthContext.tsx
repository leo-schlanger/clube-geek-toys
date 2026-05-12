/**
 * AuthContext — JWT Authentication
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import { api, setTokens, clearTokens, getAccessToken } from '../lib/api-client'
import { authLogger } from '../lib/logger'
import { useIdleTimer } from '../hooks/useIdleTimer'
import { toast } from 'sonner'
import type { UserRole } from '../types'

const IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

// =============================================================================
// Types
// =============================================================================

interface AuthUser {
  id: string
  email: string
  role: UserRole
  emailVerified: boolean
}

interface GoogleAuthResult {
  success: boolean
  error?: string
  isNewUser?: boolean
  googleName?: string
}

interface AuthContextType {
  user: AuthUser | null
  role: UserRole | null
  loading: boolean
  error: string | null
  emailVerified: boolean
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  signUp: (email: string, password: string, turnstileToken?: string) => Promise<{ success: boolean; error?: string; code?: string; userId?: string }>
  signInWithGoogle: (data: {
    accessToken: string
    refreshToken: string
    user: { id: string; email: string; role: string; emailVerified: boolean }
    isNewUser?: boolean
    googleName?: string
  }) => GoogleAuthResult
  signOut: () => Promise<{ success: boolean; error?: string }>
  sendVerificationEmail: () => Promise<{ success: boolean; error?: string }>
  refreshUser: () => Promise<void>
}

// =============================================================================
// Context
// =============================================================================

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// =============================================================================
// Provider
// =============================================================================

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [emailVerified, setEmailVerified] = useState(false)

  // Set auth state from user data
  const setAuthState = useCallback((authUser: AuthUser | null) => {
    if (authUser) {
      setUser(authUser)
      setRole(authUser.role as UserRole)
      setEmailVerified(authUser.emailVerified)
      setError(null)
    } else {
      setUser(null)
      setRole(null)
      setEmailVerified(false)
    }
  }, [])

  // Check for existing session on mount
  useEffect(() => {
    let isCurrent = true

    async function checkAuth() {
      const token = getAccessToken()
      if (!token) {
        setLoading(false)
        return
      }

      try {
        const result = await api.get('/auth/me')
        if (isCurrent) {
          if (result.data) {
            setAuthState({
              id: result.data.id,
              email: result.data.email,
              role: result.data.role,
              emailVerified: result.data.emailVerified,
            })
          } else {
            // Token invalid
            clearTokens()
          }
        }
      } catch {
        if (isCurrent) clearTokens()
      } finally {
        if (isCurrent) setLoading(false)
      }
    }

    checkAuth()

    // Listen for forced logout events (from api-client on refresh failure)
    const handleLogout = () => {
      clearTokens()
      setAuthState(null)
      toast.warning('Sessão expirada. Faça login novamente.', { duration: 5000 })
    }
    window.addEventListener('auth:logout', handleLogout)

    return () => {
      isCurrent = false
      window.removeEventListener('auth:logout', handleLogout)
    }
  }, [setAuthState])

  // Login
  async function signIn(email: string, password: string) {
    try {
      setError(null)
      const result = await api.post('/auth/login', { email, password }, { skipAuth: true })

      if (result.error) {
        return { success: false, error: result.error }
      }

      const { accessToken, refreshToken, user: userData } = result.data
      setTokens(accessToken, refreshToken)
      setAuthState(userData)

      return { success: true }
    } catch {
      return { success: false, error: 'Erro ao fazer login' }
    }
  }

  // Register
  async function signUp(email: string, password: string, turnstileToken?: string) {
    try {
      setError(null)
      const body: Record<string, string> = { email, password }
      if (turnstileToken) body.turnstileToken = turnstileToken
      const result = await api.post('/auth/register', body, { skipAuth: true })

      if (result.error) {
        // Use error codes (stable) instead of error messages (locale-dependent, may have accents)
        const isEmailTaken = result.code === 'EMAIL_ALREADY_EXISTS' || result.status === 409
        return {
          success: false,
          error: isEmailTaken ? 'Email já cadastrado' : (result.error || 'Erro ao criar conta'),
          code: result.code,
        }
      }

      const { accessToken, refreshToken, user: userData } = result.data
      setTokens(accessToken, refreshToken)
      setAuthState(userData)

      return { success: true, userId: userData.id }
    } catch {
      return { success: false, error: 'Erro ao criar conta' }
    }
  }

  // Google sign-in (tokens already obtained by GoogleSignInButton)
  function signInWithGoogle(data: {
    accessToken: string
    refreshToken: string
    user: { id: string; email: string; role: string; emailVerified: boolean }
    isNewUser?: boolean
    googleName?: string
  }): GoogleAuthResult {
    try {
      setError(null)
      setTokens(data.accessToken, data.refreshToken)
      setAuthState(data.user as AuthUser)
      return {
        success: true,
        isNewUser: data.isNewUser,
        googleName: data.googleName,
      }
    } catch {
      return { success: false, error: 'Erro ao autenticar com Google' }
    }
  }

  // Resend verification email
  async function sendVerificationEmailFn() {
    if (!user) {
      return { success: false, error: 'Usuário não autenticado' }
    }

    if (emailVerified) {
      return { success: false, error: 'Email já verificado' }
    }

    try {
      const result = await api.post('/auth/send-verification-email', {
        email: user.email,
        uid: user.id,
      })

      if (result.error) {
        return { success: false, error: result.error }
      }

      authLogger.info('Email de verificação enviado para:', user.email)
      return { success: true }
    } catch (err: unknown) {
      const error = err as { message?: string }
      authLogger.error('Erro ao enviar verificação:', error?.message)
      return {
        success: false,
        error: error?.message || 'Erro ao enviar email. Tente novamente mais tarde.',
      }
    }
  }

  // Refresh user data from server (uses JWT token, not React state)
  async function refreshUser() {
    const token = getAccessToken()
    if (!token) return

    try {
      const result = await api.get('/auth/me')
      if (result.data) {
        setAuthState({
          id: result.data.id,
          email: result.data.email,
          role: result.data.role,
          emailVerified: result.data.emailVerified,
        })
      }
    } catch {
      authLogger.error('Erro ao atualizar dados do usuário')
    }
  }

  // Logout
  async function signOut(): Promise<{ success: boolean; error?: string }> {
    try {
      await api.post('/auth/logout')
    } catch {
      // Ignore API errors on logout
    } finally {
      clearTokens()
      setAuthState(null)
    }
    return { success: true }
  }

  // Inactivity logout — auto sign-out after 30 minutes of no activity.
  // Disabled when not authenticated (nothing to log out).
  useIdleTimer({
    timeout: IDLE_TIMEOUT_MS,
    disabled: !user,
    onIdle: () => {
      toast.warning('Sessão encerrada por inatividade.', { duration: 5000 })
      signOut()
    },
  })

  // Sync between tabs: listen for token clears and apply them locally.
  // Logging out in one tab logs out in all tabs.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === 'clube_geek_access_token' && !e.newValue) {
        // Token cleared in another tab → logout here too
        setAuthState(null)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [setAuthState])

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        loading,
        error,
        emailVerified,
        signIn,
        signUp,
        signInWithGoogle,
        signOut,
        sendVerificationEmail: sendVerificationEmailFn,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// =============================================================================
// Hook
// =============================================================================

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider')
  }
  return context
}
