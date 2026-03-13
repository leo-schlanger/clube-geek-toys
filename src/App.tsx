import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { LoadingPage } from './components/ui/loading'
import { ErrorBoundary } from './components/ErrorBoundary'
import { getAppMode } from './lib/subdomain'

// Lazy loaded pages - Member Area
const Login = lazy(() => import('./pages/Login'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const Subscribe = lazy(() => import('./pages/Subscribe'))
const Register = lazy(() => import('./pages/Register'))
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'))
const MemberDashboard = lazy(() => import('./pages/MemberDashboard'))
const PaymentResult = lazy(() => import('./pages/PaymentResult'))
const TermsOfUse = lazy(() => import('./pages/TermsOfUse'))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'))

// Lazy loaded pages - Admin Area
const AdminLogin = lazy(() => import('./pages/AdminLogin'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const PDV = lazy(() => import('./pages/PDV'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
})

const APP_MODE = getAppMode()

/**
 * Rota Protegida - requer autenticação e role específica
 */
function ProtectedRoute({
  children,
  allowedRoles,
  requireEmailVerification = true,
}: {
  children: React.ReactNode
  allowedRoles?: string[]
  requireEmailVerification?: boolean
}) {
  const { user, role, loading, emailVerified } = useAuth()

  if (loading) {
    return <LoadingPage />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!role) {
    return <RoleError />
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/acesso-negado" replace />
  }

  // Verificar email para membros (admin/seller não precisa)
  if (requireEmailVerification && role === 'member' && !emailVerified) {
    return <Navigate to="/verificar-email" replace />
  }

  return <>{children}</>
}

/**
 * Erro de Role - usuário autenticado mas não cadastrado
 */
function RoleError() {
  const { signOut } = useAuth()

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center max-w-md">
        <div className="mx-auto mb-6 p-4 bg-orange-500/10 rounded-full w-fit">
          <svg className="h-16 w-16 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold mb-2">Usuário não cadastrado</h1>
        <p className="text-muted-foreground mb-6">
          Seu login existe, mas você não está cadastrado no sistema. Contate o administrador.
        </p>
        <button
          onClick={signOut}
          className="px-6 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80"
        >
          Sair
        </button>
      </div>
    </div>
  )
}

/**
 * Acesso Negado
 */
function AccessDenied() {
  const { signOut, role } = useAuth()

  const getRedirectInfo = () => {
    if (role === 'admin') return { text: 'Ir para o Painel Admin', path: '/admin' }
    if (role === 'seller') return { text: 'Ir para o PDV', path: '/pdv' }
    if (role === 'member') {
      if (APP_MODE === 'admin') return { text: 'Ir para Área do Membro', path: null }
      return { text: 'Ir para Área do Membro', path: '/membro' }
    }
    return null
  }

  const redirectInfo = getRedirectInfo()

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center max-w-md">
        <div className="mx-auto mb-6 p-4 bg-red-500/10 rounded-full w-fit">
          <svg className="h-16 w-16 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold mb-2">Acesso Negado</h1>
        <p className="text-muted-foreground mb-6">
          Você não tem permissão para acessar esta área.
        </p>
        <div className="flex gap-3 justify-center">
          {redirectInfo?.path && (
            <a
              href={redirectInfo.path}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
            >
              {redirectInfo.text}
            </a>
          )}
          <button
            onClick={signOut}
            className="px-6 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80"
          >
            Sair
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Rotas Admin
 */
function AdminRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<AdminLogin />} />

      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/pdv"
        element={
          <ProtectedRoute allowedRoles={['seller', 'admin']}>
            <PDV />
          </ProtectedRoute>
        }
      />

      <Route path="/acesso-negado" element={<AccessDenied />} />
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

/**
 * Rotas Member
 */
function MemberRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/assinar" element={<Subscribe />} />
      <Route path="/cadastro" element={<Register />} />
      <Route path="/recuperar-senha" element={<ForgotPassword />} />
      <Route path="/verificar-email" element={<VerifyEmail />} />
      <Route path="/termos" element={<TermsOfUse />} />
      <Route path="/privacidade" element={<PrivacyPolicy />} />

      <Route path="/pagamento/sucesso" element={<PaymentResult type="success" />} />
      <Route path="/pagamento/erro" element={<PaymentResult type="error" />} />
      <Route path="/pagamento/pendente" element={<PaymentResult type="pending" />} />

      <Route
        path="/membro"
        element={
          <ProtectedRoute allowedRoles={['member']}>
            <MemberDashboard />
          </ProtectedRoute>
        }
      />

      <Route path="/acesso-negado" element={<AccessDenied />} />

      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/pdv"
        element={
          <ProtectedRoute allowedRoles={['seller', 'admin']}>
            <PDV />
          </ProtectedRoute>
        }
      />

      <Route path="/" element={<Navigate to="/assinar" replace />} />
      <Route path="*" element={<Navigate to="/assinar" replace />} />
    </Routes>
  )
}

/**
 * App Routes
 */
function AppRoutes() {
  if (APP_MODE === 'admin') {
    return <AdminRoutes />
  }
  return <MemberRoutes />
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <Suspense fallback={<LoadingPage />}>
              <AppRoutes />
            </Suspense>
            <Toaster position="top-right" richColors />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
