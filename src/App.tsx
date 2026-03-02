import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { LoadingPage } from './components/ui/loading'

// Pages
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import Subscribe from './pages/Subscribe'
import Register from './pages/Register'
import MemberDashboard from './pages/MemberDashboard'
import PDV from './pages/PDV'
import AdminDashboard from './pages/AdminDashboard'
import PaymentResult from './pages/PaymentResult'

const queryClient = new QueryClient()

// Protected Route Component
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
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    // Redirect based on role
    if (role === 'admin') return <Navigate to="/admin" replace />
    if (role === 'seller') return <Navigate to="/pdv" replace />
    return <Navigate to="/membro" replace />
  }

  return <>{children}</>
}

// Public Route (redirect if logged in)
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, role, loading } = useAuth()

  if (loading) {
    return <LoadingPage />
  }

  if (user) {
    // Redirect based on role
    if (role === 'admin') return <Navigate to="/admin" replace />
    if (role === 'seller') return <Navigate to="/pdv" replace />
    return <Navigate to="/membro" replace />
  }

  return <>{children}</>
}

function AppRoutes() {
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

      {/* Payment Routes */}
      <Route path="/pagamento/sucesso" element={<PaymentResult type="success" />} />
      <Route path="/pagamento/erro" element={<PaymentResult type="error" />} />
      <Route path="/pagamento/pendente" element={<PaymentResult type="pending" />} />

      {/* Member Routes */}
      <Route
        path="/membro"
        element={
          <ProtectedRoute allowedRoles={['member', 'admin']}>
            <MemberDashboard />
          </ProtectedRoute>
        }
      />

      {/* Seller Routes */}
      <Route
        path="/pdv"
        element={
          <ProtectedRoute allowedRoles={['seller', 'admin']}>
            <PDV />
          </ProtectedRoute>
        }
      />

      {/* Admin Routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      {/* Default Redirect */}
      <Route path="/" element={<Navigate to="/assinar" replace />} />
      <Route path="*" element={<Navigate to="/assinar" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
          <Toaster position="top-right" richColors />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
