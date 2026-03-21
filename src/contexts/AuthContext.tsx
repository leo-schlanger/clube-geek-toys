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
  type User,
} from 'firebase/auth'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { authLogger } from '../lib/logger'
import { sendVerificationEmail } from '../lib/email'
import { toast } from 'sonner'
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
  signOut: () => Promise<{ success: boolean; error?: string }>
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

  // Buscar role e emailVerified do Firestore
  async function fetchUserData(uid: string): Promise<{ role: UserRole | null; firestoreEmailVerified: boolean }> {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid))

      if (!userDoc.exists()) {
        setError('Usuário não cadastrado no sistema')
        return { role: null, firestoreEmailVerified: false }
      }

      const data = userDoc.data()
      const userRole = data?.role as UserRole | 'disabled'
      const firestoreEmailVerified = data?.emailVerified === true

      if (!userRole) {
        setError('Permissão não definida')
        return { role: null, firestoreEmailVerified }
      }

      // Bloquear acesso para usuários desativados
      if (userRole === 'disabled') {
        setError('Sua conta foi desativada. Entre em contato com o administrador.')
        return { role: null, firestoreEmailVerified }
      }

      return { role: userRole as UserRole, firestoreEmailVerified }
    } catch (err) {
      authLogger.error('Erro ao buscar dados do usuário:', err)
      setError('Erro ao carregar permissões')
      return { role: null, firestoreEmailVerified: false }
    }
  }

  // Listener de autenticação com proteção contra race condition
  useEffect(() => {
    let isCurrent = true // Flag para evitar race condition

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)

        const { role: userRole, firestoreEmailVerified } = await fetchUserData(firebaseUser.uid)

        // Email é verificado se Firebase Auth OU Firestore dizem que é
        // (nosso sistema customizado atualiza Firestore, Firebase nativo atualiza Auth)
        const isEmailVerified = firebaseUser.emailVerified || firestoreEmailVerified

        // Só atualiza se ainda for o usuário atual (evita race condition)
        if (isCurrent && auth.currentUser?.uid === firebaseUser.uid) {
          setEmailVerified(isEmailVerified)
          setRole(userRole)
          if (userRole) setError(null)
        }
      } else {
        if (isCurrent) {
          setUser(null)
          setRole(null)
          setError(null)
          setEmailVerified(false)
        }
      }

      if (isCurrent) {
        setLoading(false)
      }
    })

    return () => {
      isCurrent = false // Marca como stale quando desmonta
      unsubscribe()
    }
  }, [])

  // Login
  async function signIn(email: string, password: string) {
    try {
      setError(null)
      await signInWithEmailAndPassword(auth, email, password)
      return { success: true }
    } catch (err) {
      const firebaseError = err as { code?: string }

      // Mensagens padronizadas para evitar email enumeration
      // Não revelar se email existe ou não
      const errorMessages: Record<string, string> = {
        'auth/invalid-credential': 'Email ou senha incorretos',
        'auth/user-not-found': 'Email ou senha incorretos', // Mesmo msg para não revelar
        'auth/wrong-password': 'Email ou senha incorretos', // Mesmo msg para não revelar
        'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.',
        'auth/network-request-failed': 'Erro de conexão. Verifique sua internet.',
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

      // Enviar email de verificação via Worker (template customizado)
      try {
        const emailResult = await sendVerificationEmail(
          result.user.email || email,
          result.user.uid,
          result.user.displayName || undefined
        )

        if (emailResult.success) {
          authLogger.info('Email de verificação enviado para:', result.user.email)
        } else {
          throw new Error(emailResult.error || 'Failed to send verification email')
        }
      } catch (verificationError: unknown) {
        const err = verificationError as { message?: string }
        authLogger.error('Erro ao enviar email de verificação:', err?.message)

        toast.warning('Atenção: Email de verificação', {
          description: 'Não foi possível enviar o email de verificação. Você pode reenviar após o login.',
          duration: 8000,
        })
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

  // Reenviar email de verificação via Worker
  async function sendVerificationEmailFn() {
    if (!user) {
      return { success: false, error: 'Usuário não autenticado' }
    }

    // Verificar se já está verificado (Firebase Auth ou Firestore)
    if (emailVerified) {
      return { success: false, error: 'Email já verificado' }
    }

    try {
      const result = await sendVerificationEmail(
        user.email || '',
        user.uid,
        user.displayName || undefined
      )

      if (result.success) {
        authLogger.info('Email de verificação reenviado para:', user.email)
        return { success: true }
      } else {
        throw new Error(result.error || 'Failed to send verification email')
      }
    } catch (err: unknown) {
      const error = err as { message?: string }
      authLogger.error('Erro ao reenviar verificação:', error?.message)

      return {
        success: false,
        error: error?.message || 'Erro ao enviar email. Tente novamente mais tarde.',
      }
    }
  }

  // Atualizar dados do usuário (para verificar emailVerified)
  async function refreshUser() {
    const currentUser = auth.currentUser
    if (currentUser) {
      await currentUser.reload()

      // Verificar também no Firestore (nosso sistema customizado)
      const { firestoreEmailVerified } = await fetchUserData(currentUser.uid)

      // Email é verificado se Firebase Auth OU Firestore dizem que é
      const isEmailVerified = currentUser.emailVerified || firestoreEmailVerified
      setEmailVerified(isEmailVerified)
    }
  }

  // Logout
  async function signOut(): Promise<{ success: boolean; error?: string }> {
    try {
      await firebaseSignOut(auth)
      return { success: true }
    } catch (err) {
      authLogger.error('Erro no logout:', err)
      // Força limpeza do estado local mesmo com erro
      setUser(null)
      setRole(null)
      setEmailVerified(false)
      return { success: false, error: 'Erro ao sair. Sessão encerrada localmente.' }
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
