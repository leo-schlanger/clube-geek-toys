/**
 * AuthContext - Firebase Authentication with localStorage cache
 */

import {
  createContext,
  useContext,
  useCallback,
  useState,
  useEffect,
  type ReactNode,
} from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { doc, setDoc, getDoc, enableNetwork } from 'firebase/firestore'
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
// LocalStorage helpers
// =============================================================================

const ROLE_CACHE_KEY = 'auth_role_cache'

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

    // Check if cache is for this user and not expired (1 hour)
    const ONE_HOUR = 60 * 60 * 1000
    if (data.uid === uid && Date.now() - data.timestamp < ONE_HOUR) {
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

  // Fetch role from Firestore or cache
  const fetchRole = useCallback(async (uid: string): Promise<UserRole | null> => {
    // Try cache first
    const cached = getCachedRole(uid)
    if (cached) {
      setRole(cached)
      setError(null)
      setUserNotFound(false)
      return cached
    }

    // Fetch from Firestore
    try {
      const userDoc = await getDoc(doc(db, 'users', uid))

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
      setError('Erro ao carregar permissões')
      setRole(null)
      return null
    }
  }, [])

  // Listen to auth state changes - runs once on mount
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
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
    })

    return () => unsubscribe()
  }, [fetchRole])

  // Auth methods
  const signIn = useCallback(async (email: string, password: string) => {
    try {
      setError(null)
      await signInWithEmailAndPassword(auth, email, password)
      // onAuthStateChanged will handle the rest
      return { success: true }
    } catch (err: unknown) {
      const firebaseError = err as { code?: string }

      const errorMap: Record<string, string> = {
        'auth/invalid-credential': 'Email ou senha incorretos',
        'auth/user-not-found': 'Usuário não encontrado',
        'auth/wrong-password': 'Senha incorreta',
        'auth/too-many-requests': 'Muitas tentativas. Tente novamente mais tarde.',
        'auth/user-disabled': 'Esta conta foi desativada',
        'auth/invalid-email': 'Email inválido',
      }

      return {
        success: false,
        error: errorMap[firebaseError.code || ''] || 'Erro ao fazer login'
      }
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password)

      await setDoc(doc(db, 'users', result.user.uid), {
        email: result.user.email,
        role: 'member' as UserRole,
        createdAt: new Date().toISOString(),
      })

      // Cache the new role
      setCachedRole(result.user.uid, 'member')

      return { success: true }
    } catch (err: unknown) {
      const firebaseError = err as { code?: string }

      const errorMap: Record<string, string> = {
        'auth/email-already-in-use': 'Este email já está em uso',
        'auth/invalid-email': 'Email inválido',
        'auth/weak-password': 'Senha muito fraca (mínimo 6 caracteres)',
        'auth/operation-not-allowed': 'Cadastro desabilitado temporariamente',
      }

      return {
        success: false,
        error: errorMap[firebaseError.code || ''] || 'Erro ao criar conta'
      }
    }
  }, [])

  const signOut = useCallback(async () => {
    clearCachedRole()
    setRole(null)
    setError(null)
    setUserNotFound(false)
    await firebaseSignOut(auth)
  }, [])

  const refreshRole = useCallback(async () => {
    if (!user) return
    clearCachedRole()
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
