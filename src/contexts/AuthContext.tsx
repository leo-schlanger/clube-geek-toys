/**
 * AuthContext - Autenticação Firebase simplificada
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
import type { UserRole } from '../types'

// =============================================================================
// Types
// =============================================================================

interface AuthContextType {
  user: User | null
  role: UserRole | null
  loading: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  signUp: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  signOut: () => Promise<void>
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

  // Buscar role do Firestore
  async function fetchUserRole(uid: string): Promise<UserRole | null> {
    try {
      console.log('[Auth] Buscando role para:', uid)
      const userDoc = await getDoc(doc(db, 'users', uid))

      if (!userDoc.exists()) {
        console.log('[Auth] Documento não existe em users/' + uid)
        return null
      }

      const data = userDoc.data()
      console.log('[Auth] Dados do usuário:', data)
      return (data?.role as UserRole) || 'member'
    } catch (err) {
      console.error('[Auth] Erro ao buscar role:', err)
      return null
    }
  }

  // Listener de autenticação
  useEffect(() => {
    console.log('[Auth] Iniciando listener de autenticação')

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('[Auth] Estado mudou:', firebaseUser?.email || 'sem usuário')

      if (firebaseUser) {
        setUser(firebaseUser)
        const userRole = await fetchUserRole(firebaseUser.uid)
        console.log('[Auth] Role obtida:', userRole)
        setRole(userRole)

        if (!userRole) {
          setError('Usuário não cadastrado no sistema')
        } else {
          setError(null)
        }
      } else {
        setUser(null)
        setRole(null)
        setError(null)
      }

      setLoading(false)
      console.log('[Auth] Loading = false')
    })

    return () => unsubscribe()
  }, [])

  // Login
  async function signIn(email: string, password: string) {
    try {
      setError(null)
      console.log('[Auth] Fazendo login:', email)
      await signInWithEmailAndPassword(auth, email, password)
      return { success: true }
    } catch (err) {
      console.error('[Auth] Erro no login:', err)
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
      console.log('[Auth] Criando conta:', email)

      const result = await createUserWithEmailAndPassword(auth, email, password)

      // Criar documento do usuário
      await setDoc(doc(db, 'users', result.user.uid), {
        email: result.user.email,
        role: 'member' as UserRole,
        createdAt: new Date().toISOString(),
      })

      return { success: true }
    } catch (err) {
      console.error('[Auth] Erro no cadastro:', err)
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

  // Logout
  async function signOut() {
    try {
      await firebaseSignOut(auth)
    } catch (err) {
      console.error('[Auth] Erro no logout:', err)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        loading,
        error,
        signIn,
        signUp,
        signOut,
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
