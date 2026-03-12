import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { LoadingPage } from './components/ui/loading'
import { ErrorBoundary } from './components/ErrorBoundary'
import { getAppMode, getLoginRedirectPath } from './lib/subdomain'

// Lazy loaded pages - Member Area
const Login = lazy(() => import('./pages/Login'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const Subscribe = lazy(() => import('./pages/Subscribe'))
const Register = lazy(() => import('./pages/Register'))
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
      staleTime: 1000 * 60 * 5, // 5 minutes - data stays fresh
      gcTime: 1000 * 60 * 30, // 30 minutes - cache retention
      retry: 2,
      refetchOnWindowFocus: false, // Avoid unnecessary refetches
    },
  },
})

// Get app mode once at startup
const APP_MODE = getAppMode()

/**
 * Role Error Component
 * Shown when user is authenticated but role couldn't be determined
 */
function RoleError({ userNotFound, error }: { userNotFound: boolean; error: string | null }) {
  const { signOut, refreshRole, loading } = useAuth()

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center max-w-md">
        <div className={`mx-auto mb-6 p-4 rounded-full w-fit ${userNotFound ? 'bg-orange-500/10' : 'bg-yellow-500/10'}`}>
          <svg className={`h-16 w-16 ${userNotFound ? 'text-orange-500' : 'text-yellow-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {userNotFound ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            )}
          </svg>
        </div>
        <h1 className="text-2xl font-bold mb-2">
          {userNotFound ? 'Usuário não cadastrado' : 'Erro ao carregar permissões'}
        </h1>
        <p className="text-muted-foreground mb-6">
          {userNotFound
            ? 'Seu login existe, mas você não está cadastrado no sistema. Contate o administrador para obter acesso.'
            : error || 'Não foi possível verificar suas permissões. Tente novamente.'}
        </p>
        <div className="flex gap-3 justify-center">
          {!userNotFound && (
            <button
              onClick={refreshRole}
              disabled={loading}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Carregando...' : 'Tentar novamente'}
            </button>
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
 * Protected Route Component
 * Handles authentication and role-based access
 */
function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode
  allowedRoles?: string[]
}) {
  const { user, role, loading, error, userNotFound } = useAuth()

  if (loading) {
    return <LoadingPage />
  }

  if (!user) {
    // Redirect to login page
    return <Navigate to="/login" replace />
  }

  // User is authenticated but role couldn't be fetched (error or not found)
  if (role === null) {
    return <RoleError userNotFound={userNotFound} error={error} />
  }

  // Check if role is allowed
  if (allowedRoles && !allowedRoles.includes(role)) {
    // Redirect to access denied instead of looping
    return <Navigate to="/acesso-negado" replace />
  }

  return <>{children}</>
}

/**
 * Public Route - redirects logged in users
 * Only redirects if role is successfully loaded (not null)
 */
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, role, loading, error, userNotFound } = useAuth()

  if (loading) {
    return <LoadingPage />
  }

  // User is logged in and role is loaded - redirect to appropriate area
  if (user && role) {
    const redirectPath = getLoginRedirectPath(role, APP_MODE)
    return <Navigate to={redirectPath} replace />
  }

  // User is logged in but role couldn't be fetched - let them stay on login
  // to see error messages and retry button (handled by login components)
  if (user && role === null && (error || userNotFound)) {
    return <>{children}</>
  }

  return <>{children}</>
}

/**
 * Access Denied Component
 * Shows role-specific messages to help users understand why they can't access
 */
function AccessDenied() {
  const { signOut, role } = useAuth()

  // Determine the correct area for the user based on their role
  const getRedirectInfo = () => {
    if (role === 'admin') {
      return { text: 'Ir para o Painel Admin', path: '/admin' }
    }
    if (role === 'seller') {
      return { text: 'Ir para o PDV', path: '/pdv' }
    }
    if (role === 'member') {
      // On admin subdomain, members should go to the member site
      if (APP_MODE === 'admin') {
        return { text: 'Ir para a Área do Membro', path: null, external: true }
      }
      return { text: 'Ir para a Área do Membro', path: '/membro' }
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
        <p className="text-muted-foreground mb-2">
          Você não tem permissão para acessar esta área.
        </p>
        {role === 'member' && APP_MODE === 'admin' && (
          <p className="text-sm text-muted-foreground mb-4">
            Esta área é exclusiva para administradores e vendedores.
            Acesse a área do membro em <strong>club.geektoys.com.br</strong>
          </p>
        )}
        {(role === 'admin' || role === 'seller') && APP_MODE === 'member' && (
          <p className="text-sm text-muted-foreground mb-4">
            Você está na área de membros. Acesse o painel admin em <strong>admin.geektoys.com.br</strong>
          </p>
        )}
        <div className="flex gap-3 justify-center mt-6">
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
 * Admin Routes - shown on admin subdomain (admin.geektoys.com.br)
 *
 * Role System:
 * - 'admin': Full system access (dashboard, users, members, payments)
 * - 'seller': PDV access only (verify members, add points)
 * - 'member': No access here - redirected to AccessDenied
 *
 * Note: Admin and Seller do NOT need an active membership (plan).
 * They are system users, not club members.
 */
function AdminRoutes() {
  return (
    <Routes>
      {/* Admin Login */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <AdminLogin />
          </PublicRoute>
        }
      />

      {/* Admin Dashboard - admin only */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      {/* PDV - sellers and admins */}
      <Route
        path="/pdv"
        element={
          <ProtectedRoute allowedRoles={['seller', 'admin']}>
            <PDV />
          </ProtectedRoute>
        }
      />

      {/* Access Denied - shown when role doesn't match */}
      <Route path="/acesso-negado" element={<AccessDenied />} />

      {/* Default Redirect */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

/**
 * Member Routes - shown on member subdomain (club.geektoys.com.br)
 *
 * Role System:
 * - 'member': Access to member dashboard (requires active membership for full features)
 * - 'admin': Redirected to /admin
 * - 'seller': Redirected to /pdv
 *
 * Note: Members need an active membership (plan) to see their card and benefits.
 * The MemberDashboard handles showing "no subscription" state internally.
 */
function MemberRoutes() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route path="/assinar" element={<Subscribe />} />
      <Route path="/cadastro" element={<Register />} />
      <Route path="/recuperar-senha" element={<ForgotPassword />} />
      <Route path="/termos" element={<TermsOfUse />} />
      <Route path="/privacidade" element={<PrivacyPolicy />} />

      {/* Payment Routes */}
      <Route path="/pagamento/sucesso" element={<PaymentResult type="success" />} />
      <Route path="/pagamento/erro" element={<PaymentResult type="error" />} />
      <Route path="/pagamento/pendente" element={<PaymentResult type="pending" />} />

      {/* Member Dashboard - members only, validates membership internally */}
      <Route
        path="/membro"
        element={
          <ProtectedRoute allowedRoles={['member']}>
            <MemberDashboard />
          </ProtectedRoute>
        }
      />

      {/* Access Denied */}
      <Route path="/acesso-negado" element={<AccessDenied />} />

      {/* Admin/Seller can access their areas from member subdomain */}
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

      {/* Default Redirect */}
      <Route path="/" element={<Navigate to="/assinar" replace />} />
      <Route path="*" element={<Navigate to="/assinar" replace />} />
    </Routes>
  )
}

/**
 * App Routes - chooses based on subdomain
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
