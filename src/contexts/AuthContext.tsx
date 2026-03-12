import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import type { UserRole } from '../types'

interface AuthContextType {
  user: User | null | undefined
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
  // Use react-firebase-hooks for auth state
  const [user, authLoading, authError] = useAuthState(auth)

  const [role, setRole] = useState<UserRole | null>(null)
  const [roleLoading, setRoleLoading] = useState(false)
  const [roleError, setRoleError] = useState<string | null>(null)
  const [userNotFound, setUserNotFound] = useState(false)

  // Fetch role when user changes
  useEffect(() => {
    if (authLoading) return

    if (!user) {
      setRole(null)
      setRoleError(null)
      setUserNotFound(false)
      return
    }

    // Fetch role from Firestore
    const fetchRole = async () => {
      setRoleLoading(true)
      setRoleError(null)
      setUserNotFound(false)

      try {
        console.log('[Auth] Fetching role for:', user.uid)
        const userRef = doc(db, 'users', user.uid)
        const userSnap = await getDoc(userRef)

        if (!userSnap.exists()) {
          console.log('[Auth] User not found in Firestore')
          setUserNotFound(true)
          setRoleError('Usuário não cadastrado no sistema.')
          setRole(null)
        } else {
          const data = userSnap.data()
          console.log('[Auth] User data:', data)
          setRole((data.role as UserRole) || 'member')
        }
      } catch (error: any) {
        console.error('[Auth] Error fetching role:', error)
        setRoleError(error.message || 'Erro ao carregar permissões')
        setRole(null)
      } finally {
        setRoleLoading(false)
      }
    }

    fetchRole()
  }, [user, authLoading])

  // Log auth errors
  useEffect(() => {
    if (authError) {
      console.error('[Auth] Auth error:', authError)
    }
  }, [authError])

  // Combined loading state
  const loading = authLoading || roleLoading

  // Refresh role
  const refreshRole = useCallback(async () => {
    if (!user) return

    setRoleLoading(true)
    try {
      const userRef = doc(db, 'users', user.uid)
      const userSnap = await getDoc(userRef)

      if (userSnap.exists()) {
        setRole((userSnap.data().role as UserRole) || 'member')
        setRoleError(null)
        setUserNotFound(false)
      }
    } catch (error: any) {
      setRoleError(error.message)
    } finally {
      setRoleLoading(false)
    }
  }, [user])

  // Sign in
  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password)
      return { user: result.user, error: null }
    } catch (error: any) {
      console.error('[Auth] Sign in error:', error.code)
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
    } catch (error: any) {
      console.error('[Auth] Sign up error:', error.code)
      return { user: null, error: error as Error }
    }
  }, [])

  // Sign out
  const signOut = useCallback(async () => {
    await firebaseSignOut(auth)
    setRole(null)
    setRoleError(null)
    setUserNotFound(false)
  }, [])

  const value = useMemo(() => ({
    user: user ?? null,
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
