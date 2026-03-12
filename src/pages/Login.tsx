import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card'
import { Loading } from '../components/ui/loading'
import { Eye, EyeOff, LogIn, AlertTriangle, RefreshCw, UserX } from 'lucide-react'
import { getAppMode, getLoginRedirectPath } from '../lib/subdomain'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { signIn, role, error: authError, userNotFound, refreshRole, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  // Redirect when role is loaded
  useEffect(() => {
    if (!authLoading && role) {
      const redirectPath = getLoginRedirectPath(role, getAppMode())
      navigate(redirectPath, { replace: true })
    }
  }, [authLoading, role, navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    setIsSubmitting(true)

    const result = await signIn(email, password)

    if (!result.success) {
      setFormError(result.error || 'Erro ao fazer login')
    }

    setIsSubmitting(false)
  }

  async function handleRetry() {
    setFormError('')
    await refreshRole()
  }

  const isLoading = isSubmitting || authLoading

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <img src="/logo.jpg" alt="Geek & Toys" className="h-16 rounded mx-auto" />
          </div>
          <CardTitle className="text-2xl font-heading gradient-text">Clube Geek & Toys</CardTitle>
          <CardDescription>
            Acesse sua área de membro
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {formError && (
              <div className="p-3 rounded-md bg-red-500/10 border border-red-500/50 text-red-500 text-sm">
                {formError}
              </div>
            )}

            {userNotFound && (
              <div className="p-3 rounded-md bg-orange-500/10 border border-orange-500/50 text-orange-600 text-sm">
                <div className="flex items-center gap-2 mb-2">
                  <UserX className="h-4 w-4" />
                  <span className="font-medium">Usuário não cadastrado</span>
                </div>
                <p className="text-xs opacity-80">
                  Seu login existe mas você não está cadastrado no sistema.
                  Complete seu cadastro para acessar.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/assinar')}
                  className="w-full mt-2"
                >
                  Completar cadastro
                </Button>
              </div>
            )}

            {authError && !userNotFound && (
              <div className="p-3 rounded-md bg-yellow-500/10 border border-yellow-500/50 text-yellow-600 text-sm">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-medium">Erro ao carregar dados</span>
                </div>
                <p className="text-xs opacity-80 mb-2">{authError}</p>
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
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
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
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="text-right">
              <Link
                to="/recuperar-senha"
                className="text-sm text-primary hover:underline"
              >
                Esqueceu a senha?
              </Link>
            </div>
          </CardContent>

          <CardFooter className="flex-col gap-4">
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loading size="sm" />
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" />
                  Entrar
                </>
              )}
            </Button>

            <p className="text-sm text-muted-foreground">
              Ainda não é membro?{' '}
              <Link to="/assinar" className="text-primary hover:underline">
                Assine agora
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
