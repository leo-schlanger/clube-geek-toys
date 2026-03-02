import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
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
  signIn: (email: string, password: string) => Promise<{ user: User | null; error: Error | null }>
  signUp: (email: string, password: string) => Promise<{ user: User | null; error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)

      if (firebaseUser) {
        await fetchUserRole(firebaseUser.uid)
      } else {
        setRole(null)
      }

      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  async function fetchUserRole(userId: string) {
    // Timeout of 5 seconds to prevent hanging on blocked requests
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout fetching user role')), 5000)
    )

    try {
      const fetchPromise = getDoc(doc(db, 'users', userId))
      const userDoc = (await Promise.race([fetchPromise, timeoutPromise])) as any

      if (userDoc.exists()) {
        const userData = userDoc.data()
        setRole((userData.role as UserRole) || 'member')
      } else {
        setRole('member')
      }
    } catch (error) {
      console.error('Error fetching user role:', error)
      // Fallback to 'member' role instead of hanging
      setRole('member')
    }
  }

  async function signIn(email: string, password: string) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password)
      return { user: userCredential.user, error: null }
    } catch (error) {
      return { user: null, error: error as Error }
    }
  }

  async function signUp(email: string, password: string) {
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
  }

  async function signOut() {
    await firebaseSignOut(auth)
    setUser(null)
    setRole(null)
  }

  const value = {
    user,
    role,
    loading,
    signIn,
    signUp,
    signOut,
  }

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
