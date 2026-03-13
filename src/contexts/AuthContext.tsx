/**
 * AuthContext - Firebase Authentication
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendEmailVerification,
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
  emailVerified: boolean
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  signUp: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  signOut: () => Promise<void>
  sendVerificationEmail: () => Promise<{ success: boolean; error?: string }>
  refreshUser: () => Promise<void>
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
  const [emailVerified, setEmailVerified] = useState(false)

  // Buscar role do Firestore
  async function fetchUserRole(uid: string): Promise<UserRole | null> {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid))

      if (!userDoc.exists()) {
        setError('Usuário não cadastrado no sistema')
        return null
      }

      const data = userDoc.data()
      const userRole = data?.role as UserRole

      if (!userRole) {
        setError('Permissão não definida')
        return null
      }

      return userRole
    } catch (err) {
      console.error('[Auth] Erro ao buscar role:', err)
      setError('Erro ao carregar permissões')
      return null
    }
  }

  // Listener de autenticação
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)
        setEmailVerified(firebaseUser.emailVerified)
        const userRole = await fetchUserRole(firebaseUser.uid)
        setRole(userRole)
        if (userRole) setError(null)
      } else {
        setUser(null)
        setRole(null)
        setError(null)
        setEmailVerified(false)
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  // Login
  async function signIn(email: string, password: string) {
    try {
      setError(null)
      await signInWithEmailAndPassword(auth, email, password)
      return { success: true }
    } catch (err) {
      const firebaseError = err as { code?: string }

      const errorMessages: Record<string, string> = {
        'auth/invalid-credential': 'Email ou senha incorretos',
        'auth/user-not-found': 'Usuário não encontrado',
        'auth/wrong-password': 'Senha incorreta',
        'auth/too-many-requests': 'Muitas tentativas. Aguarde.',
        'auth/network-request-failed': 'Erro de conexão',
      }

      return {
        success: false,
        error: errorMessages[firebaseError.code || ''] || 'Erro ao fazer login',
      }
    }
  }

  // Cadastro
  async function signUp(email: string, password: string) {
    try {
      setError(null)
      const result = await createUserWithEmailAndPassword(auth, email, password)

      await setDoc(doc(db, 'users', result.user.uid), {
        email: result.user.email,
        role: 'member' as UserRole,
        createdAt: new Date().toISOString(),
      })

      // Enviar email de verificação
      try {
        await sendEmailVerification(result.user)
        console.log('[Auth] Email de verificação enviado para:', result.user.email)
      } catch (verificationError: any) {
        console.error('[Auth] Erro ao enviar email de verificação:', verificationError?.code, verificationError?.message)
        // Não falha o cadastro se o email de verificação falhar
      }

      return { success: true }
    } catch (err) {
      const firebaseError = err as { code?: string }

      const errorMessages: Record<string, string> = {
        'auth/email-already-in-use': 'Email já cadastrado',
        'auth/weak-password': 'Senha muito fraca',
        'auth/invalid-email': 'Email inválido',
      }

      return {
        success: false,
        error: errorMessages[firebaseError.code || ''] || 'Erro ao criar conta',
      }
    }
  }

  // Reenviar email de verificação
  async function sendVerificationEmailFn() {
    if (!user) {
      return { success: false, error: 'Usuário não autenticado' }
    }

    if (user.emailVerified) {
      return { success: false, error: 'Email já verificado' }
    }

    try {
      await sendEmailVerification(user)
      console.log('[Auth] Email de verificação reenviado para:', user.email)
      return { success: true }
    } catch (err: any) {
      console.error('[Auth] Erro ao reenviar verificação:', err?.code, err?.message)

      if (err?.code === 'auth/too-many-requests') {
        return { success: false, error: 'Aguarde alguns minutos antes de reenviar' }
      }

      return { success: false, error: `Erro ao enviar email: ${err?.code || 'desconhecido'}` }
    }
  }

  // Atualizar dados do usuário (para verificar emailVerified)
  async function refreshUser() {
    const currentUser = auth.currentUser
    if (currentUser) {
      await currentUser.reload()
      // Atualizar estado de emailVerified após reload
      setEmailVerified(currentUser.emailVerified)
    }
  }

  // Logout
  async function signOut() {
    try {
      await firebaseSignOut(auth)
    } catch {
      // Silently fail
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        loading,
        error,
        emailVerified,
        signIn,
        signUp,
        signOut,
        sendVerificationEmail: sendVerificationEmailFn,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// =============================================================================
// Hook
// =============================================================================

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider')
  }
  return context
}
