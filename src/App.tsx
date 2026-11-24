import { lazy, Suspense, type ComponentType } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { LoadingPage } from './components/ui/loading'
import { SkipLink } from './components/ui/skip-link'
import { OfflineBanner } from './components/ui/offline-banner'
import { ErrorBoundary } from './components/ErrorBoundary'
import { CookieConsent } from './components/CookieConsent'
import { ConfirmProvider } from './hooks/useConfirm'
import { CartProvider } from './contexts/CartContext'
import { ThemeProvider, useTheme } from './contexts/ThemeContext'
import { ThemeCornerLayout } from './components/ThemeCornerLayout'
import { getAppMode, getLoginRedirectPath } from './lib/subdomain'
import { EventAnnouncementBanner } from './components/store/EventAnnouncementBanner'
import { ShopPromoBanner } from './components/store/ShopPromoBanner'
import { ScrollToTop } from './components/store/ScrollToTop'
import { seedQueriesFromBoot, withBootData } from './lib/boot-data'
import { NatalBannerSlot } from './components/seasonal/natal'
import { SeoHead } from './components/store/SeoHead'
import NotFound from './pages/NotFound'

function ThemedToaster() {
  const { resolved } = useTheme()
  return <Toaster position="top-right" richColors theme={resolved} />
}

// Shop pages mount once boot.js's first-screen answers are in (capped at
// 400 ms), with the strips' queries seeded: no late push-down (CLS).
function shopPage<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  return lazy(() =>
    withBootData(load()).then((module) => {
      seedQueriesFromBoot(queryClient)
      return module
    })
  )
}

// Lazy loaded pages - Member Area
const Login = lazy(() => import('./pages/Login'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const Subscribe = lazy(() => import('./pages/Subscribe'))
const Register = lazy(() => import('./pages/Register'))
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'))
const MemberVerify = lazy(() => import('./pages/MemberVerify'))
const MemberDashboard = lazy(() => import('./pages/MemberDashboard'))
const PaymentResult = lazy(() => import('./pages/PaymentResult'))
const TermsOfUse = lazy(() => import('./pages/TermsOfUse'))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'))

// Lazy loaded pages - Admin Area
const AdminLogin = lazy(() => import('./pages/AdminLogin'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const PDV = lazy(() => import('./pages/PDV'))

// Lazy loaded pages — Shop
const ShopHome = shopPage(() => import('./pages/shop/ShopHome'))
const ProductDetail = shopPage(() => import('./pages/shop/ProductDetail'))
const Cart = shopPage(() => import('./pages/shop/Cart'))
const ShopCheckout = shopPage(() => import('./pages/shop/ShopCheckout'))
const OrderConfirmation = shopPage(() => import('./pages/shop/OrderConfirmation'))
const ShopLogin = shopPage(() => import('./pages/shop/ShopLogin'))
const ShopRegister = shopPage(() => import('./pages/shop/ShopRegister'))
const ShopProfile = shopPage(() => import('./pages/shop/ShopProfile'))
const EventPage = shopPage(() => import('./pages/shop/EventPage'))
const TicketPage = shopPage(() => import('./pages/shop/TicketPage'))
const MyOrders = shopPage(() => import('./pages/shop/MyOrders'))
const MyOrderDetail = shopPage(() => import('./pages/shop/MyOrderDetail'))
const WholesaleHome = shopPage(() => import('./pages/shop/WholesaleHome'))
const WholesaleLogin = shopPage(() => import('./pages/shop/WholesaleLogin'))
const WholesaleRegister = shopPage(() => import('./pages/shop/WholesaleRegister'))

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
 * Requires authentication and a specific role.
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

  // Members with an unverified email return to signup to finish the flow
  if (requireEmailVerification && role === 'member' && !emailVerified) {
    return <Navigate to="/cadastro" replace />
  }

  return <>{children}</>
}

/**
 * Authenticated but with no matching record.
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

/** Wrong role for this subdomain. */
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

function AdminRoutes() {
  return (
    <Routes>
      <Route caseSensitive path="/login" element={<AdminLogin />} />

      <Route
        caseSensitive
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        caseSensitive
        path="/pdv"
        element={
          <ProtectedRoute allowedRoles={['seller', 'admin']}>
            <PDV />
          </ProtectedRoute>
        }
      />

      <Route caseSensitive path="/acesso-negado" element={<AccessDenied />} />
      <Route caseSensitive path="/" element={<Navigate to="/login" replace />} />
      <Route caseSensitive path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

/**
 * Where `/` and unknown paths land on the member subdomain.
 *
 * A signed-in member goes to their area, where a pending signup sees the
 * payment screen; only visitors get the sales page.
 */
function MemberEntry() {
  const { user, role, loading } = useAuth()
  if (loading) return <LoadingPage />
  if (user && role) return <Navigate to={getLoginRedirectPath(role, 'member')} replace />
  return <Navigate to="/assinar" replace />
}

/**
 * Head for routes whose page sets none. Without it the URL kept the shell's
 * canonical (or the previous page's), so every club page claimed to be `/`.
 */
function NoIndex({ title, path }: { title: string; path: string }) {
  return <SeoHead title={title} path={path} noIndex />
}

/**
 * Terms and privacy cover the club and the shop, so both hosts serve them.
 * Indexed on club.* only; on shop.* they are noindex (same text twice).
 */
function LegalTerms() {
  return (
    <>
      <SeoHead
        title="Termos de Uso | Clube GeekPop & Toys"
        description="Termos de uso do Clube e da loja online GeekPop & Toys: assinatura, pagamento, cancelamento, compras online, direito de arrependimento e atendimento."
        path="/termos"
        noIndex={APP_MODE === 'shop'}
      />
      <TermsOfUse />
    </>
  )
}

function LegalPrivacy() {
  return (
    <>
      <SeoHead
        title="Política de Privacidade | Clube GeekPop & Toys"
        description="Como o Clube e a loja GeekPop & Toys tratam seus dados pessoais: o que coletamos, por quanto tempo, com quem compartilhamos e seus direitos pela LGPD."
        path="/privacidade"
        noIndex={APP_MODE === 'shop'}
      />
      <PrivacyPolicy />
    </>
  )
}

function MemberRoutes() {
  return (
    <Routes>
      <Route caseSensitive path="/login" element={<><NoIndex title="Entrar" path="/login" /><Login /></>} />
      <Route caseSensitive path="/assinar" element={<Subscribe />} />
      <Route element={<ThemeCornerLayout />}>
        <Route caseSensitive path="/cadastro" element={<><NoIndex title="Criar conta" path="/cadastro" /><Register /></>} />
        <Route caseSensitive path="/recuperar-senha" element={<><NoIndex title="Recuperar senha" path="/recuperar-senha" /><ForgotPassword /></>} />
        <Route caseSensitive path="/verificar-email" element={<><NoIndex title="Confirmar e-mail" path="/verificar-email" /><VerifyEmail /></>} />
        <Route caseSensitive path="/pagamento/sucesso" element={<><NoIndex title="Pagamento" path="/pagamento/sucesso" /><PaymentResult type="success" /></>} />
        <Route caseSensitive path="/pagamento/erro" element={<><NoIndex title="Pagamento" path="/pagamento/erro" /><PaymentResult type="error" /></>} />
        <Route caseSensitive path="/pagamento/pendente" element={<><NoIndex title="Pagamento" path="/pagamento/pendente" /><PaymentResult type="pending" /></>} />
      </Route>
      {/* Shows the member's full name: never in a search result. */}
      <Route caseSensitive path="/verificar/:id" element={<><NoIndex title="Carteirinha" path="/verificar" /><MemberVerify /></>} />
      <Route caseSensitive path="/termos" element={<LegalTerms />} />
      <Route caseSensitive path="/privacidade" element={<LegalPrivacy />} />

      <Route
        caseSensitive
        path="/membro"
        element={
          <ProtectedRoute allowedRoles={['member']} requireEmailVerification={false}>
            <NoIndex title="Área do membro" path="/membro" />
            <MemberDashboard />
          </ProtectedRoute>
        }
      />

      <Route caseSensitive path="/acesso-negado" element={<><NoIndex title="Acesso negado" path="/acesso-negado" /><AccessDenied /></>} />

      <Route
        caseSensitive
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <NoIndex title="Painel" path="/admin" />
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        caseSensitive
        path="/pdv"
        element={
          <ProtectedRoute allowedRoles={['seller', 'admin']}>
            <NoIndex title="PDV" path="/pdv" />
            <PDV />
          </ProtectedRoute>
        }
      />

      <Route caseSensitive path="/" element={<MemberEntry />} />
      {/* Unknown club paths already answer 404 (nginx); members still land in their area. */}
      <Route caseSensitive path="*" element={<MemberEntry />} />
    </Routes>
  )
}

// Re-renders on navigation, so the strip hides on checkout and comes back after.
function ShopSeasonalBanner() {
  useLocation()
  return <NatalBannerSlot variant="shop" />
}

/**
 * Shop routes: public, with the cart. The event banner sits above them all.
 */
function ShopRoutes() {
  return (
    <CartProvider>
      <ScrollToTop />
      <EventAnnouncementBanner />
      {/* Below the event: a date on the calendar outranks a standing price rule. */}
      <ShopPromoBanner />
      {/* Seasonal greeting, lowest of the three; only on storefront routes. */}
      <ShopSeasonalBanner />
      <Routes>
        <Route caseSensitive path="/" element={<ShopHome />} />
        <Route caseSensitive path="/categoria/:slug" element={<ShopHome />} />
        <Route caseSensitive path="/produto/:slug" element={<ProductDetail />} />
        <Route caseSensitive path="/carrinho" element={<><NoIndex title="Carrinho" path="/carrinho" /><Cart /></>} />
        <Route caseSensitive path="/checkout" element={<ShopCheckout />} />
        <Route caseSensitive path="/pedido/:id" element={<OrderConfirmation />} />
        <Route caseSensitive path="/minhas-compras" element={<MyOrders />} />
        <Route caseSensitive path="/minhas-compras/:id" element={<MyOrderDetail />} />
        <Route caseSensitive path="/entrar" element={<><NoIndex title="Entrar" path="/entrar" /><ShopLogin /></>} />
        {/* Shop register/profile skip club membership. */}
        <Route caseSensitive path="/cadastro" element={<ShopRegister />} />
        <Route caseSensitive path="/perfil" element={<ShopProfile />} />
        <Route caseSensitive path="/evento" element={<EventPage />} />
        <Route caseSensitive path="/termos" element={<LegalTerms />} />
        <Route caseSensitive path="/privacidade" element={<LegalPrivacy />} />
        {/* Named ticket URL is public: the attendee often has no shop account. */}
        <Route caseSensitive path="/ingresso/:code" element={<TicketPage mode="ticket" />} />
        <Route caseSensitive path="/ingressos/:code" element={<TicketPage mode="reservation" />} />
        <Route caseSensitive path="/atacado" element={<WholesaleHome />} />
        <Route caseSensitive path="/atacado/entrar" element={<WholesaleLogin />} />
        <Route caseSensitive path="/atacado/cadastro" element={<WholesaleRegister />} />
        <Route caseSensitive path="/atacado/produto/:slug" element={<ProductDetail />} />
        <Route caseSensitive path="/atacado/carrinho" element={<><NoIndex title="Carrinho" path="/atacado/carrinho" /><Cart /></>} />
        <Route caseSensitive path="/atacado/checkout" element={<ShopCheckout />} />
        <Route caseSensitive path="*" element={<NotFound homeLabel="Ir para a loja" />} />
      </Routes>
    </CartProvider>
  )
}

/**
 * App Routes
 */
function AppRoutes() {
  if (APP_MODE === 'admin') {
    return <AdminRoutes />
  }
  if (APP_MODE === 'shop') {
    return <ShopRoutes />
  }
  return <MemberRoutes />
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <ConfirmProvider>
                <SkipLink />
                <OfflineBanner />
                <Suspense fallback={<LoadingPage />}>
                  <main id="main-content">
                    <AppRoutes />
                  </main>
                </Suspense>
                <ThemedToaster />
                <CookieConsent />
              </ConfirmProvider>
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
