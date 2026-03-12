import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card'
import { Eye, EyeOff, AlertTriangle, RefreshCw, UserX, Loader2 } from 'lucide-react'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { user, role, signIn, roleError, userNotFound, refreshRole, loading } = useAuth()

  // Redirect when authenticated with role
  useEffect(() => {
    console.log('[AdminLogin] State:', { user: !!user, role, loading, roleError, userNotFound })

    if (loading) {
      console.log('[AdminLogin] Still loading, waiting...')
      return
    }

    if (user && role) {
      console.log('[AdminLogin] User authenticated with role:', role, '- redirecting to /admin')
      // Force navigation
      window.location.href = '/admin'
    }
  }, [user, role, loading])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)

    console.log('[AdminLogin] Submitting login...')

    const { error: signInError } = await signIn(email, password)

    if (signInError) {
      console.log('[AdminLogin] Sign in error:', signInError)
      setError('Credenciais inválidas')
      setIsSubmitting(false)
      return
    }

    console.log('[AdminLogin] Sign in successful, auth state will update...')
    // Don't set isSubmitting to false here - let the redirect happen
    // or let it reset when role error occurs
  }

  // Reset submitting state when role loading completes
  useEffect(() => {
    if (!loading && isSubmitting) {
      if (roleError || userNotFound || !role) {
        setIsSubmitting(false)
      }
    }
  }, [loading, isSubmitting, roleError, userNotFound, role])

  async function handleRetry() {
    setError('')
    setIsSubmitting(true)
    await refreshRole()
    setIsSubmitting(false)
  }

  const showLoading = loading || isSubmitting

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
            {error && (
              <div className="p-3 rounded-md bg-red-500/10 border border-red-500/50 text-red-400 text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {error}
              </div>
            )}

            {userNotFound && !showLoading && (
              <div className="p-3 rounded-md bg-orange-500/10 border border-orange-500/50 text-orange-400 text-sm">
                <div className="flex items-center gap-2 mb-2">
                  <UserX className="h-4 w-4" />
                  <span className="font-medium">Usuário não cadastrado</span>
                </div>
                <p className="text-xs opacity-80">
                  Seu login existe mas você não está cadastrado como admin/vendedor no sistema.
                  Contate o administrador para obter acesso.
                </p>
              </div>
            )}

            {roleError && !userNotFound && !showLoading && (
              <div className="p-3 rounded-md bg-yellow-500/10 border border-yellow-500/50 text-yellow-400 text-sm">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-medium">Erro ao carregar permissões</span>
                </div>
                <p className="text-xs opacity-80 mb-2">{roleError}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRetry}
                  disabled={showLoading}
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
                disabled={showLoading}
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
                  disabled={showLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  disabled={showLoading}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={showLoading}
            >
              {showLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isSubmitting ? 'Entrando...' : 'Carregando...'}
                </span>
              ) : (
                'Acessar Painel'
              )}
            </Button>
          </CardFooter>
        </form>

        <div className="px-6 pb-6">
          <p className="text-xs text-center text-muted-foreground">
            Acesso exclusivo para administradores e vendedores autorizados.
          </p>
        </div>

        {/* Debug info - remove after fixing */}
        <div className="px-6 pb-6 text-xs text-muted-foreground border-t pt-4 mt-4">
          <p>Debug: user={user ? 'yes' : 'no'}, role={role || 'null'}, loading={String(loading)}</p>
          {roleError && <p className="text-red-400">Error: {roleError}</p>}
        </div>
      </Card>
    </div>
  )
}
