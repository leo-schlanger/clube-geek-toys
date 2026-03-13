import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card'
import { Eye, EyeOff, AlertTriangle, RefreshCw, UserX, Loader2, WifiOff } from 'lucide-react'
import { getAppMode, getLoginRedirectPath } from '../lib/subdomain'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { user, role, signIn, error: authError, userNotFound, refreshRole, loading } = useAuth()

  // Redirect if authenticated with role - use proper role-based redirect
  if (!loading && user && role) {
    const redirectPath = getLoginRedirectPath(role, getAppMode())
    return <Navigate to={redirectPath} replace />
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    setIsSubmitting(true)

    const result = await signIn(email, password)

    if (!result.success) {
      setFormError(result.error || 'Credenciais inválidas')
    }

    setIsSubmitting(false)
  }

  async function handleRetry() {
    setFormError('')
    await refreshRole()
  }

  // Check if error is network related
  const isNetworkError = authError?.toLowerCase().includes('conexão') ||
    authError?.toLowerCase().includes('internet') ||
    authError?.toLowerCase().includes('servidor') ||
    formError?.toLowerCase().includes('conexão') ||
    formError?.toLowerCase().includes('internet')

  const isLoading = loading || isSubmitting

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border bg-card/80 backdrop-blur">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <img src="/logo.jpg" alt="Geek & Toys" className="h-16 rounded mx-auto" />
          </div>
          <CardTitle className="text-2xl font-heading gradient-text">
            Painel Administrativo
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Geek & Toys - Acesso Restrito
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {formError && (
              <div className={`p-3 rounded-md text-sm flex items-center gap-2 ${
                isNetworkError
                  ? 'bg-orange-500/10 border border-orange-500/50 text-orange-400'
                  : 'bg-red-500/10 border border-red-500/50 text-red-400'
              }`}>
                {isNetworkError ? (
                  <WifiOff className="h-4 w-4 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                )}
                {formError}
              </div>
            )}

            {!isLoading && userNotFound && (
              <div className="p-3 rounded-md bg-orange-500/10 border border-orange-500/50 text-orange-400 text-sm">
                <div className="flex items-center gap-2 mb-2">
                  <UserX className="h-4 w-4" />
                  <span className="font-medium">Usuário não cadastrado</span>
                </div>
                <p className="text-xs opacity-80">
                  Seu login existe mas você não está cadastrado como admin/vendedor.
                  Contate o administrador.
                </p>
              </div>
            )}

            {!isLoading && authError && !userNotFound && (
              <div className={`p-3 rounded-md text-sm ${
                isNetworkError
                  ? 'bg-orange-500/10 border border-orange-500/50 text-orange-400'
                  : 'bg-yellow-500/10 border border-yellow-500/50 text-yellow-400'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {isNetworkError ? (
                    <WifiOff className="h-4 w-4" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )}
                  <span className="font-medium">
                    {isNetworkError ? 'Problema de conexão' : 'Erro ao carregar permissões'}
                  </span>
                </div>
                <p className="text-xs opacity-80 mb-2">{authError}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRetry}
                  className="w-full"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Tentar novamente
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@geektoys.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  disabled={isLoading}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </CardContent>

          <CardFooter>
            <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {loading ? 'Carregando...' : 'Entrando...'}
                </span>
              ) : (
                'Acessar Painel'
              )}
            </Button>
          </CardFooter>
        </form>

        <div className="px-6 pb-6">
          <p className="text-xs text-center text-muted-foreground">
            Acesso exclusivo para administradores e vendedores.
          </p>
        </div>
      </Card>
    </div>
  )
}
