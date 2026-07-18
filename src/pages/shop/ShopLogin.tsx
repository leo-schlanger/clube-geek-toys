import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff, LogIn, ShieldAlert, Sparkles, ArrowLeft } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { normalizeEmail } from '../../lib/sanitize'
import { isBlocked, recordFailedAttempt, clearAttempts } from '../../lib/rate-limit'
import { GoogleSignInButton } from '../../components/GoogleSignInButton'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../../components/ui/card'
import { Loading } from '../../components/ui/loading'

/**
 * Login opcional da loja. Espelha src/pages/Login.tsx (mesmo AuthContext),
 * mas redireciona para "/" (vitrine da loja) após o sucesso — não para /membro.
 * Serve para o cliente ganhar 15% de desconto de membro.
 */
export default function ShopLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [lockoutTime, setLockoutTime] = useState(0)

  const { user, loading, signIn, signInWithGoogle } = useAuth()
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

  // Já autenticado → volta para a loja.
  useEffect(() => {
    if (!loading && user) {
      navigate('/', { replace: true })
    }
  }, [loading, user, navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')

    const normalizedEmail = normalizeEmail(email)

    const { blocked, remainingTime } = isBlocked(normalizedEmail)
    if (blocked) {
      setLockoutTime(remainingTime)
      setFormError('Muitas tentativas. Aguarde antes de tentar novamente.')
      return
    }

    setIsSubmitting(true)
    const result = await signIn(normalizedEmail, password)

    if (!result.success) {
      const { blocked: nowBlocked, attemptsRemaining, lockoutSeconds } =
        recordFailedAttempt(normalizedEmail)
      if (nowBlocked) {
        setLockoutTime(lockoutSeconds)
        setFormError('Conta bloqueada temporariamente. Aguarde 5 minutos.')
      } else if (attemptsRemaining <= 2) {
        setFormError(`${result.error}. ${attemptsRemaining} tentativa(s) restante(s).`)
      } else {
        setFormError(result.error || 'Erro ao fazer login')
      }
      setIsSubmitting(false)
    } else {
      clearAttempts(normalizedEmail)
      // Redirecionamento tratado pelo useEffect que observa `user`.
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
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
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2 text-muted-foreground">
          <Link to="/">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Voltar à loja
          </Link>
        </Button>

        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex items-center justify-center">
              <img src="/logo-vip.png" alt="Clube Geek & Toys" className="h-14 w-auto" />
            </div>
            <CardTitle className="font-heading text-2xl">Entrar</CardTitle>
            <CardDescription>
              Login é opcional — entre para ganhar{' '}
              <strong className="text-green-600">15% de desconto</strong> de membro.
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {/* Selo de benefício */}
              <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                <span>Membros do clube pagam 15% menos em qualquer produto.</span>
              </div>

              {/* Google Sign-In */}
              <GoogleSignInButton
                label="Entrar com Google"
                disabled={isSubmitting || isLocked}
                onSuccess={(data) => {
                  const result = signInWithGoogle(data)
                  if (!result.success) {
                    setFormError(result.error || 'Erro ao autenticar com Google')
                  }
                  // Redirect tratado pelo useEffect.
                }}
                onError={(err) => setFormError(err)}
              />

              {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">ou</span>
                  </div>
                </div>
              )}

              {isLocked && (
                <div className="flex items-start gap-3 rounded-lg border border-red-500/50 bg-red-500/10 p-3">
                  <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                  <div className="text-sm">
                    <p className="font-medium text-red-500">Conta bloqueada</p>
                    <p className="text-xs text-red-400">
                      Tente novamente em{' '}
                      <span className="font-mono tabular-nums">{formatTime(lockoutTime)}</span>
                    </p>
                  </div>
                </div>
              )}

              {formError && !isLocked && (
                <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-500">
                  {formError}
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
                  disabled={isSubmitting || isLocked}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="********"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isSubmitting || isLocked}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    disabled={isLocked}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex-col gap-4">
              <Button type="submit" className="w-full" size="lg" disabled={isSubmitting || isLocked}>
                {isSubmitting ? (
                  <Loading size="sm" />
                ) : isLocked ? (
                  <>
                    <ShieldAlert className="mr-2 h-4 w-4" />
                    Aguarde {formatTime(lockoutTime)}
                  </>
                ) : (
                  <>
                    <LogIn className="mr-2 h-4 w-4" />
                    Entrar
                  </>
                )}
              </Button>

              <div className="w-full text-center text-sm text-muted-foreground">
                Não é membro?{' '}
                <a
                  href="https://club.geeketoys.com.br/assinar"
                  className="font-semibold text-primary hover:underline"
                >
                  Assine o clube
                </a>
              </div>

              <Button asChild variant="ghost" size="sm" className="w-full">
                <Link to="/">Continuar sem entrar</Link>
              </Button>
            </CardFooter>
          </form>
        </Card>
      </motion.div>
    </div>
  )
}
