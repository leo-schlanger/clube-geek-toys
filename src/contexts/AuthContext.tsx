/**
 * AuthContext - Modern Firebase Authentication for React 19
 *
 * Uses useSyncExternalStore for proper React 19 concurrent mode support
 * with Firebase's onAuthStateChanged listener.
 *
 * @see https://react.dev/reference/react/useSyncExternalStore
 * @see https://firebase.google.com/docs/auth/web/start
 */

import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useSyncExternalStore,
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
  type Auth,
} from 'firebase/auth'
import { doc, setDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore'
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
// Firebase Auth Store (External Store for useSyncExternalStore)
// =============================================================================

/**
 * Creates an external store for Firebase Auth state
 * This allows React 19's concurrent mode to work properly with Firebase
 */
function createAuthStore(firebaseAuth: Auth) {
  let currentUser: User | null = null
  let isInitialized = false
  const listeners = new Set<() => void>()

  // Subscribe to Firebase auth state changes
  const unsubscribeAuth = onAuthStateChanged(firebaseAuth, (user) => {
    currentUser = user
    isInitialized = true
    // Notify all subscribers
    listeners.forEach((listener) => listener())
  })

  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot() {
      return { user: currentUser, isInitialized }
    },
    getServerSnapshot() {
      return { user: null, isInitialized: false }
    },
    cleanup() {
      unsubscribeAuth()
      listeners.clear()
    },
  }
}

// Create singleton store
const authStore = createAuthStore(auth)

// =============================================================================
// Custom Hook: useFirebaseAuth
// =============================================================================

/**
 * Hook that uses useSyncExternalStore for Firebase auth state
 * This is the React 19 recommended way to subscribe to external stores
 */
function useFirebaseAuth() {
  const snapshot = useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot
  )
  return snapshot
}

// =============================================================================
// Context
// =============================================================================

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// =============================================================================
// Provider
// =============================================================================

export function AuthProvider({ children }: { children: ReactNode }) {
  // Use the external store for auth state
  const { user, isInitialized } = useFirebaseAuth()

  // Role state (fetched from Firestore)
  const [role, setRole] = useState<UserRole | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [userNotFound, setUserNotFound] = useState(false)
  const [roleLoading, setRoleLoading] = useState(false)

  // Firestore listener cleanup ref
  const roleUnsubscribeRef = useRef<Unsubscribe | null>(null)
  const currentUidRef = useRef<string | null>(null)

  // =============================================================================
  // Role Fetching with Real-time Listener
  // =============================================================================

  const setupRoleListener = useCallback((uid: string) => {
    // Cleanup previous listener
    if (roleUnsubscribeRef.current) {
      roleUnsubscribeRef.current()
      roleUnsubscribeRef.current = null
    }

    // Don't re-setup if same user
    if (currentUidRef.current === uid) {
      return
    }

    currentUidRef.current = uid
    setRoleLoading(true)
    setError(null)
    setUserNotFound(false)

    // Use onSnapshot for real-time updates
    const userDocRef = doc(db, 'users', uid)

    roleUnsubscribeRef.current = onSnapshot(
      userDocRef,
      (snapshot) => {
        setRoleLoading(false)

        if (!snapshot.exists()) {
          // User document not found in Firestore
          setRole(null)
          setUserNotFound(true)
          setError('Usuário não cadastrado no sistema.')
          return
        }

        const data = snapshot.data() as { role?: UserRole }
        const newRole = data?.role || 'member'

        // Role successfully loaded
        setRole(newRole)
        setError(null)
        setUserNotFound(false)
      },
      (err) => {
        console.error('[Auth] Error fetching role:', err)
        setRoleLoading(false)
        setError(err.message || 'Erro ao carregar permissões')
        setRole(null)
      }
    )
  }, [])

  const cleanupRoleListener = useCallback(() => {
    if (roleUnsubscribeRef.current) {
      roleUnsubscribeRef.current()
      roleUnsubscribeRef.current = null
    }
    currentUidRef.current = null
    setRole(null)
    setError(null)
    setUserNotFound(false)
    setRoleLoading(false)
  }, [])

  // =============================================================================
  // Effect: Setup/Cleanup Role Listener on User Change
  // =============================================================================

  useEffect(() => {
    if (user) {
      setupRoleListener(user.uid)
    } else if (isInitialized) {
      // Only cleanup when user logs out (not on initial load)
      cleanupRoleListener()
    }

    return () => {
      // Cleanup listener on unmount
      if (roleUnsubscribeRef.current) {
        roleUnsubscribeRef.current()
        roleUnsubscribeRef.current = null
      }
    }
  }, [user, isInitialized, setupRoleListener, cleanupRoleListener])

  // =============================================================================
  // Auth Methods
  // =============================================================================

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      setRoleLoading(true)
      await signInWithEmailAndPassword(auth, email, password)
      return { success: true }
    } catch (err: unknown) {
      console.error('[Auth] Sign in error:', err)
      setRoleLoading(false)

      const firebaseError = err as { code?: string }

      // Map Firebase errors to user-friendly messages
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

      // Create user document with member role
      await setDoc(doc(db, 'users', result.user.uid), {
        email: result.user.email,
        role: 'member' as UserRole,
        createdAt: new Date().toISOString(),
      })

      return { success: true }
    } catch (err: unknown) {
      console.error('[Auth] Sign up error:', err)

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
    cleanupRoleListener()
    await firebaseSignOut(auth)
  }, [cleanupRoleListener])

  const refreshRole = useCallback(async () => {
    if (!user) return

    // Force refetch by cleaning up and re-setting up the listener
    if (roleUnsubscribeRef.current) {
      roleUnsubscribeRef.current()
      roleUnsubscribeRef.current = null
    }
    currentUidRef.current = null
    setRole(null)

    // Small delay to ensure cleanup is complete
    await new Promise(resolve => setTimeout(resolve, 100))

    setupRoleListener(user.uid)
  }, [user, setupRoleListener])

  // =============================================================================
  // Computed State
  // =============================================================================

  const loading = !isInitialized || (user !== null && roleLoading)

  const value = useMemo<AuthContextType>(() => ({
    user,
    role,
    loading,
    error,
    userNotFound,
    signIn,
    signUp,
    signOut,
    refreshRole,
  }), [user, role, loading, error, userNotFound, signIn, signUp, signOut, refreshRole])

  return (
    <AuthContext.Provider value={value}>
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

// =============================================================================
// Cleanup (for hot module replacement)
// =============================================================================

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    authStore.cleanup()
  })
}
