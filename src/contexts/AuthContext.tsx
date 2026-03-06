import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
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

      if (userData?.role) {
        setRole(userData.role)
      } else {
        setRole('member')
      }
    } catch (error) {
      console.error('Error fetching user role:', error)
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
