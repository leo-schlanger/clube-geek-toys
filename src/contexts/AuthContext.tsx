import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
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

  // Fetch role from Firestore with retry
  const fetchRole = useCallback(async (uid: string, retryCount = 0): Promise<UserRole | null> => {
    const MAX_RETRIES = 3
    const RETRY_DELAY = 1000

    try {
      console.log(`[Auth] Fetching role for ${uid} (attempt ${retryCount + 1})`)

      // Force token refresh to ensure Firestore has valid auth
      const currentUser = auth.currentUser
      if (currentUser) {
        await currentUser.getIdToken(true)
        console.log('[Auth] Token refreshed')
      }

      const userRef = doc(db, 'users', uid)
      const userSnap = await getDoc(userRef)

      if (!userSnap.exists()) {
        console.log('[Auth] User document not found')
        setUserNotFound(true)
        setRoleError('Usuário não cadastrado no sistema.')
        return null
      }

      const data = userSnap.data() as { role?: UserRole } | undefined
      console.log('[Auth] Role fetched:', data?.role)
      return data?.role || 'member'
    } catch (error: any) {
      console.error('[Auth] Erro ao buscar role:', error)

      // Retry on failure
      if (retryCount < MAX_RETRIES) {
        console.log(`[Auth] Retrying in ${RETRY_DELAY}ms...`)
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
        return fetchRole(uid, retryCount + 1)
      }

      setRoleError(error.message || 'Erro ao carregar permissões')
      return null
    }
  }, [])

  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)

      if (firebaseUser) {
        setUserNotFound(false)
        setRoleError(null)
        const userRole = await fetchRole(firebaseUser.uid)
        setRole(userRole)
      } else {
        setRole(null)
        setRoleError(null)
        setUserNotFound(false)
      }

      setLoading(false)
    })

    return unsubscribe
  }, [fetchRole])

  // Refresh role
  const refreshRole = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setRoleError(null)
    setUserNotFound(false)
    const userRole = await fetchRole(user.uid)
    setRole(userRole)
    setLoading(false)
  }, [user, fetchRole])

  // Sign in
  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password)
      return { user: result.user, error: null }
    } catch (error) {
      return { user: null, error: error as Error }
    }
  }, [])

  // Sign up
  const signUp = useCallback(async (email: string, password: string) => {
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password)

      await setDoc(doc(db, 'users', result.user.uid), {
        email: result.user.email,
        role: 'member',
        createdAt: new Date().toISOString(),
      })

      return { user: result.user, error: null }
    } catch (error) {
      return { user: null, error: error as Error }
    }
  }, [])

  // Sign out
  const signOut = useCallback(async () => {
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
