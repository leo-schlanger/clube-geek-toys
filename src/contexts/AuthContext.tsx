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

  // Fetch user role from Firestore
  const fetchUserRole = useCallback(async (userId: string): Promise<UserRole | null> => {
    console.log('[Auth] Fetching role for user:', userId)

    setUserNotFound(false)
    setRoleError(null)

    try {
      const userRef = doc(db, 'users', userId)
      const userSnap = await getDoc(userRef)

      if (!userSnap.exists()) {
        console.log('[Auth] User document not found')
        setUserNotFound(true)
        setRoleError('Usuário não cadastrado no sistema.')
        return null
      }

      const userData = userSnap.data()
      console.log('[Auth] User data:', userData)

      if (userData.role) {
        console.log('[Auth] Role found:', userData.role)
        return userData.role as UserRole
      }

      // No role set, default to member
      console.log('[Auth] No role set, defaulting to member')
      return 'member'
    } catch (error: any) {
      console.error('[Auth] Error fetching role:', error)
      setRoleError(`Erro ao carregar permissões: ${error.message || 'Erro desconhecido'}`)
      return null
    }
  }, [])

  // Listen to auth state changes
  useEffect(() => {
    console.log('[Auth] Setting up auth listener')

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('[Auth] Auth state changed:', firebaseUser?.uid || 'null')

      setUser(firebaseUser)

      if (firebaseUser) {
        const userRole = await fetchUserRole(firebaseUser.uid)
        setRole(userRole)
      } else {
        setRole(null)
        setRoleError(null)
        setUserNotFound(false)
      }

      setLoading(false)
    })

    return () => {
      console.log('[Auth] Cleaning up auth listener')
      unsubscribe()
    }
  }, [fetchUserRole])

  // Refresh role manually
  const refreshRole = useCallback(async () => {
    if (user) {
      setLoading(true)
      const userRole = await fetchUserRole(user.uid)
      setRole(userRole)
      setLoading(false)
    }
  }, [user, fetchUserRole])

  // Sign in
  const signIn = useCallback(async (email: string, password: string) => {
    console.log('[Auth] Signing in:', email)
    try {
      const result = await signInWithEmailAndPassword(auth, email, password)
      console.log('[Auth] Sign in successful')
      return { user: result.user, error: null }
    } catch (error) {
      console.error('[Auth] Sign in error:', error)
      return { user: null, error: error as Error }
    }
  }, [])

  // Sign up
  const signUp = useCallback(async (email: string, password: string) => {
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password)

      // Create user document
      try {
        await setDoc(doc(db, 'users', result.user.uid), {
          email: result.user.email,
          role: 'member',
          createdAt: new Date().toISOString(),
        })
      } catch (e) {
        console.error('[Auth] Error creating user doc:', e)
      }

      return { user: result.user, error: null }
    } catch (error) {
      return { user: null, error: error as Error }
    }
  }, [])

  // Sign out
  const signOut = useCallback(async () => {
    console.log('[Auth] Signing out')
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
