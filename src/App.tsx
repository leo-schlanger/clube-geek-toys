import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { LoadingPage } from './components/ui/loading'
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

const queryClient = new QueryClient()

// Get app mode once at startup
const APP_MODE = getAppMode()

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
  const { user, role, loading } = useAuth()

  if (loading) {
    return <LoadingPage />
  }

  if (!user) {
    // Redirect to login page
    return <Navigate to="/login" replace />
  }

  // Check if role is allowed
  if (allowedRoles && role && !allowedRoles.includes(role)) {
    // Redirect based on role and app mode
    const redirectPath = getLoginRedirectPath(role, APP_MODE)
    return <Navigate to={redirectPath} replace />
  }

  return <>{children}</>
}

/**
 * Public Route - redirects logged in users
 */
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, role, loading } = useAuth()

  if (loading) {
    return <LoadingPage />
  }

  if (user) {
    const redirectPath = getLoginRedirectPath(role, APP_MODE)
    return <Navigate to={redirectPath} replace />
  }

  return <>{children}</>
}

/**
 * Access Denied Component
 */
function AccessDenied() {
  const { signOut } = useAuth()

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
        <button
          onClick={signOut}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
        >
          Sair
        </button>
      </div>
    </div>
  )
}

/**
 * Admin Routes - shown on admin subdomain
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

      {/* Admin Dashboard */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      {/* PDV - Sellers */}
      <Route
        path="/pdv"
        element={
          <ProtectedRoute allowedRoles={['seller', 'admin']}>
            <PDV />
          </ProtectedRoute>
        }
      />

      {/* Access Denied */}
      <Route path="/acesso-negado" element={<AccessDenied />} />

      {/* Default Redirect */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

/**
 * Member Routes - shown on member/main subdomain
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

      {/* Member Dashboard */}
      <Route
        path="/membro"
        element={
          <ProtectedRoute allowedRoles={['member']}>
            <MemberDashboard />
          </ProtectedRoute>
        }
      />

      {/* Admin can access admin from member subdomain too */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      {/* PDV */}
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
  )
}

export default App
