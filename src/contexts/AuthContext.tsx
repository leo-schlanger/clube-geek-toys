import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { FirestoreManager } from '../lib/db-utils'
import type { UserRole } from '../types'

// Type for user document from Firestore
interface UserDocument {
  id: string
  email?: string
  role?: UserRole
  createdAt?: string
}

interface AuthContextType {
  user: User | null
  role: UserRole | null
  loading: boolean
  roleError: string | null
  userNotFound: boolean // User exists in Auth but not in Firestore users collection
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

  // Memoized fetch role function with retry logic
  // Returns: UserRole if found, null if user document doesn't exist or error
  const fetchUserRole = useCallback(async (userId: string, retries = 3): Promise<UserRole | null> => {
    console.log('[Auth] fetchUserRole called for userId:', userId)
    console.log('[Auth] auth.currentUser at fetchUserRole:', auth.currentUser?.uid)
    setUserNotFound(false)

    for (let attempt = 1; attempt <= retries; attempt++) {
      console.log(`[Auth] Attempt ${attempt}/${retries} to fetch user role`)
      try {
        const userData = await FirestoreManager.getById<UserDocument>(
          'users',
          userId,
          (id, data): UserDocument => ({
            id,
            email: data.email,
            role: data.role,
            createdAt: data.createdAt,
          })
        )
        console.log('[Auth] FirestoreManager.getById returned:', userData)

        // Document doesn't exist - user not registered in system
        if (!userData) {
          console.warn('[Auth] User document not found in Firestore')
          setUserNotFound(true)
          setRoleError('Usuário não cadastrado no sistema. Contate o administrador.')
          return null
        }

        // Document exists with role
        if (userData.role) {
          console.log(`[Auth] Role fetched successfully: ${userData.role}`)
          setRoleError(null)
          setUserNotFound(false)
          return userData.role
        }

        // Document exists but no role - default to member (normal registration flow)
        console.warn('[Auth] User document found but no role set, defaulting to member')
        setRoleError(null)
        setUserNotFound(false)
        return 'member'
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.warn(`[Auth] Attempt ${attempt}/${retries} failed to fetch role: ${errorMessage}`)

        if (attempt < retries) {
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
        } else {
          // All retries failed - connection error
          console.error('[Auth] All retries failed to fetch user role')
          setRoleError(`Erro ao carregar permissões: ${errorMessage}. Verifique sua conexão.`)
          return null // Don't default to member on error - show error instead
        }
      }
    }
    return null
  }, [])

  // Memoized refresh role function (useful after network recovery)
  const refreshRole = useCallback(async () => {
    // Capture current user to avoid race conditions if user changes during fetch
    const currentUser = user
    if (currentUser) {
      setLoading(true)
      // Clear previous error states before retry
      setRoleError(null)
      setUserNotFound(false)

      const fetchedRole = await fetchUserRole(currentUser.uid)

      // Only update state if user hasn't changed during the fetch
      if (user?.uid === currentUser.uid) {
        setRole(fetchedRole)
      }
      setLoading(false)
    }
  }, [user, fetchUserRole])

  useEffect(() => {
    console.log('[Auth] Setting up auth state listener...')

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('[Auth] Auth state changed:', firebaseUser ? `User: ${firebaseUser.uid}` : 'No user')
      setUser(firebaseUser)

      if (firebaseUser) {
        // Ensure auth token is available for Firestore
        try {
          const token = await firebaseUser.getIdToken(true) // Force refresh token
          console.log('[Auth] Token refreshed, length:', token.length)
          // Small delay to ensure Firestore SDK has auth context
          await new Promise(resolve => setTimeout(resolve, 100))
        } catch (tokenError) {
          console.error('[Auth] Failed to refresh token:', tokenError)
        }

        console.log('[Auth] Fetching user role for:', firebaseUser.uid)
        console.log('[Auth] Current auth user:', auth.currentUser?.uid)
        const fetchedRole = await fetchUserRole(firebaseUser.uid)
        console.log('[Auth] Role result:', fetchedRole)
        setRole(fetchedRole)
      } else {
        setRole(null)
        setRoleError(null)
        setUserNotFound(false)
      }

      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      console.log('[Auth] Starting sign in for:', email)
      const userCredential = await signInWithEmailAndPassword(auth, email, password)
      console.log('[Auth] Sign in successful, user:', userCredential.user.uid)
      // Force token refresh to ensure Firestore has auth context
      await userCredential.user.getIdToken(true)
      console.log('[Auth] Token refreshed after sign in')
      return { user: userCredential.user, error: null }
    } catch (error) {
      console.error('[Auth] Sign in error:', error)
      return { user: null, error: error as Error }
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)

      // Try to create user document in Firestore with a timeout
      // but don't block the auth process if it fails
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Firestore timeout')), 3000)
        )

        const setDocPromise = setDoc(doc(db, 'users', userCredential.user.uid), {
          email: userCredential.user.email,
          role: 'member',
          createdAt: new Date().toISOString(),
        })

        await Promise.race([setDocPromise, timeoutPromise])
      } catch (firestoreError) {
        console.error('Non-critical: Error creating Firestore user doc:', firestoreError)
        // We continue because the Auth account was created successfully
      }

      return { user: userCredential.user, error: null }
    } catch (error) {
      return { user: null, error: error as Error }
    }
  }, [])

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth)
    setUser(null)
    setRole(null)
    setRoleError(null)
    setUserNotFound(false)
  }, [])

  // Memoize context value to prevent unnecessary re-renders
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
