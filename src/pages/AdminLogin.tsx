import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { getAppMode, getLoginRedirectPath } from '../lib/subdomain'
import { Loading } from '../components/ui/loading'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { user, role, loading, error, signIn } = useAuth()
  const navigate = useNavigate()

  // Log para debug
  console.log('[AdminLogin] Estado:', { user: user?.email, role, loading, error })

  // Redirecionar quando autenticado com role
  useEffect(() => {
    if (!loading && user && role) {
      const path = getLoginRedirectPath(role, getAppMode())
      console.log('[AdminLogin] Redirecionando para:', path)
      navigate(path, { replace: true })
    }
  }, [loading, user, role, navigate])

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

  // Loading inicial
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loading size="lg" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border bg-card/80 backdrop-blur">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <img src="/logo.jpg" alt="Geek & Toys" className="h-16 rounded mx-auto" />
          </div>
          <CardTitle className="text-2xl font-heading gradient-text">Painel Administrativo</CardTitle>
          <CardDescription className="text-muted-foreground">
            Geek & Toys - Acesso Restrito
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {/* Erro do formulário */}
            {formError && (
              <div className="p-3 rounded-md bg-red-500/10 border border-red-500/50 text-red-400 text-sm">
                {formError}
              </div>
            )}

            {/* Erro de autenticação */}
            {error && !formError && (
              <div className="p-3 rounded-md bg-orange-500/10 border border-orange-500/50 text-orange-400 text-sm">
                <p className="font-medium mb-1">Usuário não cadastrado</p>
                <p className="text-xs opacity-80">
                  Seu login não está cadastrado como admin/vendedor. Contate o administrador.
                </p>
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

          <CardFooter>
            <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Entrando...
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
