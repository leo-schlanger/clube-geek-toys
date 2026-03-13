import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card'
import { Eye, EyeOff, Loader2, ShieldAlert } from 'lucide-react'
import { getAppMode, getLoginRedirectPath } from '../lib/subdomain'
import { Loading } from '../components/ui/loading'
import { isBlocked, recordFailedAttempt, clearAttempts } from '../lib/rate-limit'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [lockoutTime, setLockoutTime] = useState(0)

  const { user, role, loading, error, signIn } = useAuth()
  const navigate = useNavigate()

  // Countdown do lockout
  useEffect(() => {
    if (lockoutTime <= 0) return

    const timer = setInterval(() => {
      setLockoutTime((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [lockoutTime])

  // Verificar bloqueio quando email muda
  useEffect(() => {
    if (email) {
      const { blocked, remainingTime } = isBlocked(email)
      if (blocked) {
        setLockoutTime(remainingTime)
      }
    }
  }, [email])

  // Redirecionar quando autenticado com role
  useEffect(() => {
    if (!loading && user && role) {
      const path = getLoginRedirectPath(role, getAppMode())
      navigate(path, { replace: true })
    }
  }, [loading, user, role, navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')

    // Verificar rate limit
    const { blocked, remainingTime } = isBlocked(email)
    if (blocked) {
      setLockoutTime(remainingTime)
      setFormError('Muitas tentativas. Aguarde antes de tentar novamente.')
      return
    }

    setIsSubmitting(true)

    const result = await signIn(email, password)

    if (!result.success) {
      // Registrar tentativa falha
      const { blocked: nowBlocked, attemptsRemaining, lockoutSeconds } = recordFailedAttempt(email)

      if (nowBlocked) {
        setLockoutTime(lockoutSeconds)
        setFormError('Conta bloqueada temporariamente. Aguarde 5 minutos.')
      } else if (attemptsRemaining <= 2) {
        setFormError(`${result.error}. ${attemptsRemaining} tentativa(s) restante(s).`)
      } else {
        setFormError(result.error || 'Credenciais inválidas')
      }
    } else {
      // Limpar tentativas após sucesso
      clearAttempts(email)
    }

    setIsSubmitting(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loading size="lg" />
      </div>
    )
  }

  const isLocked = lockoutTime > 0
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
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
            {/* Aviso de bloqueio */}
            {isLocked && (
              <div className="p-3 rounded-md bg-red-500/10 border border-red-500/50 text-red-400 text-sm">
                <div className="flex items-center gap-2 mb-1">
                  <ShieldAlert className="h-4 w-4" />
                  <span className="font-medium">Conta bloqueada</span>
                </div>
                <p className="text-xs">
                  Muitas tentativas falhas. Tente novamente em {formatTime(lockoutTime)}.
                </p>
              </div>
            )}

            {/* Erro do formulário */}
            {formError && !isLocked && (
              <div className="p-3 rounded-md bg-red-500/10 border border-red-500/50 text-red-400 text-sm">
                {formError}
              </div>
            )}

            {/* Erro de autenticação */}
            {error && !formError && !isLocked && (
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
                disabled={isSubmitting || isLocked}
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
                  disabled={isSubmitting || isLocked}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  disabled={isSubmitting || isLocked}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </CardContent>

          <CardFooter>
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={isSubmitting || isLocked}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Entrando...
                </span>
              ) : isLocked ? (
                <span className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4" />
                  Aguarde {formatTime(lockoutTime)}
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
