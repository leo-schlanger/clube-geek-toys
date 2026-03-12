import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card'
import { Loading } from '../components/ui/loading'
import { Eye, EyeOff, AlertTriangle, RefreshCw, UserX, Loader2 } from 'lucide-react'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')

  const { signIn, role, roleError, userNotFound, refreshRole, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [waitingForRole, setWaitingForRole] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)
    setStatusMessage('Verificando credenciais...')

    console.log('[AdminLogin] Starting sign in...')

    try {
      const { error } = await signIn(email, password)

      if (error) {
        console.log('[AdminLogin] Sign in error:', error)
        setError('Credenciais inválidas')
        setIsSubmitting(false)
        setStatusMessage('')
        return
      }

      console.log('[AdminLogin] Sign in successful, waiting for role...')
      setStatusMessage('Carregando permissões...')
      setWaitingForRole(true)
    } catch (err) {
      console.error('[AdminLogin] Unexpected error:', err)
      setError('Erro ao fazer login. Tente novamente.')
      setIsSubmitting(false)
      setStatusMessage('')
    }
  }

  // Handle redirect after role is loaded
  React.useEffect(() => {
    if (!waitingForRole) return

    console.log('[AdminLogin] useEffect - authLoading:', authLoading, 'role:', role, 'roleError:', roleError, 'userNotFound:', userNotFound)

    // Still loading auth state
    if (authLoading) return

    // If there's an error fetching role, stop waiting and show error
    if (roleError || userNotFound) {
      console.log('[AdminLogin] Error or user not found, stopping')
      setWaitingForRole(false)
      setIsSubmitting(false)
      setStatusMessage('')
      return
    }

    // Only redirect if role was actually loaded (not null)
    if (role) {
      console.log('[AdminLogin] Role loaded:', role, '- redirecting...')
      setWaitingForRole(false)
      setIsSubmitting(false)
      setStatusMessage('')
      navigate('/admin')
      return
    }

    // If role is still null after loading completed (edge case), reset waiting state
    // This prevents infinite waiting if something unexpected happens
    if (role === null && !authLoading && !roleError && !userNotFound) {
      console.log('[AdminLogin] Role is null with no error - edge case, resetting')
      setWaitingForRole(false)
      setIsSubmitting(false)
      setStatusMessage('')
    }
  }, [waitingForRole, authLoading, role, roleError, userNotFound, navigate])

  async function handleRetry() {
    setError('')
    await refreshRole()
  }

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

            {userNotFound && (
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

            {roleError && !userNotFound && (
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
                  disabled={authLoading}
                  className="w-full"
                >
                  {authLoading ? (
                    <Loading size="sm" />
                  ) : (
                    <>
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Tentar novamente
                    </>
                  )}
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
                disabled={isSubmitting}
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
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  disabled={isSubmitting}
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
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Entrando...
                </span>
              ) : (
                'Acessar Painel'
              )}
            </Button>
            {statusMessage && (
              <p className="text-sm text-muted-foreground text-center animate-pulse">
                {statusMessage}
              </p>
            )}
          </CardFooter>
        </form>

        <div className="px-6 pb-6">
          <p className="text-xs text-center text-muted-foreground">
            Acesso exclusivo para administradores e vendedores autorizados.
          </p>
        </div>
      </Card>
    </div>
  )
}
