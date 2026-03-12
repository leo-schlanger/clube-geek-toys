import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { doc, getDoc, setDoc, enableNetwork } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import type { UserRole } from '../types'

interface AuthContextType {
  user: User | null
  role: UserRole | null
  loading: boolean
  roleError: string | null
  userNotFound: boolean
  refreshRole: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ user: User | null; error: Error | null }>
  signUp: (email: string, password: string) => Promise<{ user: User | null; error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)
  const [roleError, setRoleError] = useState<string | null>(null)
  const [userNotFound, setUserNotFound] = useState(false)

  // Fetch user role from Firestore with timeout
  const fetchUserRole = useCallback(async (userId: string): Promise<UserRole | null> => {
    console.log('[Auth] fetchUserRole called for:', userId)

    setUserNotFound(false)
    setRoleError(null)

    try {
      // Force Firestore to connect to network
      console.log('[Auth] Enabling Firestore network...')
      await enableNetwork(db).catch(e => console.warn('[Auth] enableNetwork failed:', e))

      const userRef = doc(db, 'users', userId)
      console.log('[Auth] Getting document from Firestore...')

      // Create timeout promise - 8 seconds
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout: Firestore demorou demais')), 8000)
      })

      // Race between getDoc and timeout
      const userSnap = await Promise.race([
        getDoc(userRef),
        timeoutPromise
      ])

      console.log('[Auth] Document received, exists:', userSnap.exists())

      if (!userSnap.exists()) {
        console.log('[Auth] User document not found in Firestore')
        setUserNotFound(true)
        setRoleError('Usuário não cadastrado no sistema.')
        return null
      }

      const userData = userSnap.data()
      console.log('[Auth] User data:', JSON.stringify(userData))

      const userRole = userData.role as UserRole || 'member'
      console.log('[Auth] Role:', userRole)
      return userRole
    } catch (error: any) {
      console.error('[Auth] Error fetching role:', error)

      // Check for specific error types
      if (error.message?.includes('offline')) {
        setRoleError('Sem conexão com o servidor. Verifique sua internet.')
      } else if (error.message?.includes('Timeout')) {
        setRoleError('Servidor demorou demais. Tente novamente.')
      } else if (error.code === 'permission-denied') {
        setRoleError('Sem permissão para acessar dados.')
      } else {
        setRoleError(`Erro: ${error.message || 'Desconhecido'}`)
      }
      return null
    }
  }, [])

  // Auth state listener
  useEffect(() => {
    console.log('[Auth] Setting up onAuthStateChanged listener')

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('[Auth] onAuthStateChanged fired:', firebaseUser ? firebaseUser.email : 'no user')

      if (firebaseUser) {
        console.log('[Auth] User is authenticated, UID:', firebaseUser.uid)
        setUser(firebaseUser)

        const userRole = await fetchUserRole(firebaseUser.uid)
        console.log('[Auth] Role fetched:', userRole)
        setRole(userRole)
      } else {
        console.log('[Auth] No user authenticated')
        setUser(null)
        setRole(null)
        setRoleError(null)
        setUserNotFound(false)
      }

      console.log('[Auth] Setting loading to false')
      setLoading(false)
    })

    return () => {
      console.log('[Auth] Cleaning up listener')
      unsubscribe()
    }
  }, [fetchUserRole])

  // Refresh role
  const refreshRole = useCallback(async () => {
    if (!user) return
    console.log('[Auth] refreshRole called')
    setLoading(true)
    const userRole = await fetchUserRole(user.uid)
    setRole(userRole)
    setLoading(false)
  }, [user, fetchUserRole])

  // Sign in
  const signIn = useCallback(async (email: string, password: string) => {
    console.log('[Auth] signIn called for:', email)
    try {
      const result = await signInWithEmailAndPassword(auth, email, password)
      console.log('[Auth] signIn successful')
      return { user: result.user, error: null }
    } catch (error: any) {
      console.error('[Auth] signIn error:', error.code, error.message)
      return { user: null, error: error as Error }
    }
  }, [])

  // Sign up
  const signUp = useCallback(async (email: string, password: string) => {
    console.log('[Auth] signUp called for:', email)
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password)

      // Create user document
      await setDoc(doc(db, 'users', result.user.uid), {
        email: result.user.email,
        role: 'member',
        createdAt: new Date().toISOString(),
      })

      return { user: result.user, error: null }
    } catch (error: any) {
      console.error('[Auth] signUp error:', error.code, error.message)
      return { user: null, error: error as Error }
    }
  }, [])

  // Sign out
  const signOut = useCallback(async () => {
    console.log('[Auth] signOut called')
    await firebaseSignOut(auth)
    setUser(null)
    setRole(null)
    setRoleError(null)
    setUserNotFound(false)
  }, [])

  const value = useMemo(() => ({
    user,
    role,
    loading,
    roleError,
    userNotFound,
    refreshRole,
    signIn,
    signUp,
    signOut,
  }), [user, role, loading, roleError, userNotFound, refreshRole, signIn, signUp, signOut])

  // Debug log on every render
  console.log('[Auth] Current state:', {
    hasUser: !!user,
    role,
    loading,
    roleError,
    userNotFound
  })

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
