/**
 * AuthContext - Firebase Authentication with proper error handling
 *
 * Features:
 * - localStorage cache for role (1 hour TTL)
 * - Timeout handling for Firebase operations
 * - Network error detection
 * - Retry mechanism
 */

import {
  createContext,
  useContext,
  useCallback,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import type { UserRole } from '../types'

// =============================================================================
// Types
// =============================================================================

interface AuthContextType {
  user: User | null
  role: UserRole | null
  loading: boolean
  error: string | null
  userNotFound: boolean
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  signUp: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  signOut: () => Promise<void>
  refreshRole: () => Promise<void>
}

// =============================================================================
// Constants
// =============================================================================

const ROLE_CACHE_KEY = 'auth_role_cache'
const CACHE_TTL = 60 * 60 * 1000 // 1 hour
const AUTH_TIMEOUT = 15000 // 15 seconds timeout for auth initialization
const FIRESTORE_TIMEOUT = 10000 // 10 seconds timeout for Firestore

// =============================================================================
// LocalStorage helpers
// =============================================================================

interface RoleCache {
  uid: string
  role: UserRole
  timestamp: number
}

function getCachedRole(uid: string): UserRole | null {
  try {
    const cached = localStorage.getItem(ROLE_CACHE_KEY)
    if (!cached) return null

    const data: RoleCache = JSON.parse(cached)

    // Check if cache is for this user and not expired
    if (data.uid === uid && Date.now() - data.timestamp < CACHE_TTL) {
      return data.role
    }
  } catch {
    // Ignore parse errors
  }
  return null
}

function setCachedRole(uid: string, role: UserRole): void {
  try {
    const data: RoleCache = { uid, role, timestamp: Date.now() }
    localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify(data))
  } catch {
    // Ignore storage errors
  }
}

function clearCachedRole(): void {
  try {
    localStorage.removeItem(ROLE_CACHE_KEY)
  } catch {
    // Ignore
  }
}

// =============================================================================
// Error helpers
// =============================================================================

function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return (
      message.includes('network') ||
      message.includes('offline') ||
      message.includes('failed to fetch') ||
      message.includes('fetch failed') ||
      message.includes('err_name_not_resolved') ||
      message.includes('err_internet_disconnected') ||
      message.includes('err_network') ||
      message.includes('unavailable') ||
      message.includes('timeout')
    )
  }
  return false
}

function getFirebaseAuthError(code: string): string {
  const errorMap: Record<string, string> = {
    'auth/invalid-credential': 'Email ou senha incorretos',
    'auth/user-not-found': 'Usuário não encontrado',
    'auth/wrong-password': 'Senha incorreta',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.',
    'auth/user-disabled': 'Esta conta foi desativada',
    'auth/invalid-email': 'Email inválido',
    'auth/network-request-failed': 'Erro de conexão. Verifique sua internet.',
    'auth/internal-error': 'Erro interno. Tente novamente.',
    'auth/email-already-in-use': 'Este email já está em uso',
    'auth/weak-password': 'Senha muito fraca (mínimo 6 caracteres)',
    'auth/operation-not-allowed': 'Cadastro desabilitado temporariamente',
  }
  return errorMap[code] || 'Erro ao fazer login. Tente novamente.'
}

// =============================================================================
// Timeout helper
// =============================================================================

function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(errorMessage))
    }, ms)

    promise
      .then((result) => {
        clearTimeout(timeoutId)
        resolve(result)
      })
      .catch((error) => {
        clearTimeout(timeoutId)
        reject(error)
      })
  })
}

// =============================================================================
// Context
// =============================================================================

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// =============================================================================
// Provider
// =============================================================================

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userNotFound, setUserNotFound] = useState(false)
  const mountedRef = useRef(true)

  // Track if component is mounted
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Fetch role from Firestore with timeout
  const fetchRole = useCallback(async (uid: string): Promise<UserRole | null> => {
    // Try cache first
    const cached = getCachedRole(uid)
    if (cached) {
      if (mountedRef.current) {
        setRole(cached)
        setError(null)
        setUserNotFound(false)
      }
      return cached
    }

    // Fetch from Firestore with timeout
    try {
      const userDocPromise = getDoc(doc(db, 'users', uid))
      const userDoc = await withTimeout(
        userDocPromise,
        FIRESTORE_TIMEOUT,
        'Timeout ao carregar dados. Verifique sua conexão.'
      )

      if (!mountedRef.current) return null

      if (!userDoc.exists()) {
        setRole(null)
        setUserNotFound(true)
        setError('Usuário não cadastrado no sistema.')
        return null
      }

      const data = userDoc.data() as { role?: UserRole }
      const fetchedRole = data?.role || 'member'

      // Cache the role
      setCachedRole(uid, fetchedRole)
      setRole(fetchedRole)
      setError(null)
      setUserNotFound(false)
      return fetchedRole
    } catch (err) {
      console.error('[Auth] Error fetching role:', err)

      if (!mountedRef.current) return null

      if (isNetworkError(err)) {
        setError('Erro de conexão. Verifique sua internet e tente novamente.')
      } else {
        setError('Erro ao carregar permissões. Tente novamente.')
      }
      setRole(null)
      return null
    }
  }, [])

  // Listen to auth state changes with timeout
  useEffect(() => {
    let unsubscribe: (() => void) | null = null
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let authResolved = false

    const handleAuthStateChange = async (firebaseUser: User | null) => {
      authResolved = true
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }

      if (!mountedRef.current) return

      if (firebaseUser) {
        setUser(firebaseUser)
        await fetchRole(firebaseUser.uid)
      } else {
        setUser(null)
        setRole(null)
        setError(null)
        setUserNotFound(false)
        clearCachedRole()
      }
      setLoading(false)
    }

    // Set timeout for auth initialization
    timeoutId = setTimeout(() => {
      if (!authResolved && mountedRef.current) {
        console.error('[Auth] Auth state timeout - Firebase may be unreachable')
        setLoading(false)
        setError('Não foi possível conectar ao servidor. Verifique sua internet.')
      }
    }, AUTH_TIMEOUT)

    try {
      unsubscribe = onAuthStateChanged(auth, handleAuthStateChange, (authError) => {
        // Auth error callback
        console.error('[Auth] Auth state error:', authError)
        if (mountedRef.current) {
          setLoading(false)
          if (isNetworkError(authError)) {
            setError('Erro de conexão. Verifique sua internet.')
          } else {
            setError('Erro ao verificar autenticação.')
          }
        }
      })
    } catch (err) {
      console.error('[Auth] Failed to setup auth listener:', err)
      if (mountedRef.current) {
        setLoading(false)
        setError('Erro ao inicializar autenticação.')
      }
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      if (unsubscribe) unsubscribe()
    }
  }, [fetchRole])

  // Sign in
  const signIn = useCallback(async (email: string, password: string) => {
    try {
      setError(null)
      setUserNotFound(false)

      await withTimeout(
        signInWithEmailAndPassword(auth, email, password),
        FIRESTORE_TIMEOUT,
        'Timeout ao fazer login. Verifique sua conexão.'
      )

      // onAuthStateChanged will handle the rest
      return { success: true }
    } catch (err: unknown) {
      console.error('[Auth] Sign in error:', err)

      const firebaseError = err as { code?: string; message?: string }

      if (isNetworkError(err)) {
        return {
          success: false,
          error: 'Erro de conexão. Verifique sua internet e tente novamente.'
        }
      }

      if (firebaseError.code) {
        return {
          success: false,
          error: getFirebaseAuthError(firebaseError.code)
        }
      }

      return {
        success: false,
        error: firebaseError.message || 'Erro ao fazer login'
      }
    }
  }, [])

  // Sign up
  const signUp = useCallback(async (email: string, password: string) => {
    try {
      setError(null)

      const result = await withTimeout(
        createUserWithEmailAndPassword(auth, email, password),
        FIRESTORE_TIMEOUT,
        'Timeout ao criar conta. Verifique sua conexão.'
      )

      await withTimeout(
        setDoc(doc(db, 'users', result.user.uid), {
          email: result.user.email,
          role: 'member' as UserRole,
          createdAt: new Date().toISOString(),
        }),
        FIRESTORE_TIMEOUT,
        'Timeout ao salvar dados. Tente novamente.'
      )

      // Cache the new role
      setCachedRole(result.user.uid, 'member')

      return { success: true }
    } catch (err: unknown) {
      console.error('[Auth] Sign up error:', err)

      const firebaseError = err as { code?: string; message?: string }

      if (isNetworkError(err)) {
        return {
          success: false,
          error: 'Erro de conexão. Verifique sua internet e tente novamente.'
        }
      }

      if (firebaseError.code) {
        return {
          success: false,
          error: getFirebaseAuthError(firebaseError.code)
        }
      }

      return {
        success: false,
        error: firebaseError.message || 'Erro ao criar conta'
      }
    }
  }, [])

  // Sign out
  const signOut = useCallback(async () => {
    clearCachedRole()
    setRole(null)
    setError(null)
    setUserNotFound(false)
    try {
      await firebaseSignOut(auth)
    } catch (err) {
      console.error('[Auth] Sign out error:', err)
      // Still clear local state even if Firebase signout fails
    }
  }, [])

  // Refresh role
  const refreshRole = useCallback(async () => {
    if (!user) return
    clearCachedRole()
    setError(null)
    setUserNotFound(false)
    await fetchRole(user.uid)
  }, [user, fetchRole])

  return (
    <AuthContext.Provider value={{
      user,
      role,
      loading,
      error,
      userNotFound,
      signIn,
      signUp,
      signOut,
      refreshRole,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

// =============================================================================
// Hook
// =============================================================================

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
