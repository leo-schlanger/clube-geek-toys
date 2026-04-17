import { useState, useEffect } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { normalizeEmail } from '../lib/sanitize'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card'
import { Loading } from '../components/ui/loading'
import { Eye, EyeOff, LogIn, ShieldAlert, Star, Zap, Shield, Gift } from 'lucide-react'
import { getAppMode, getLoginRedirectPath } from '../lib/subdomain'
import { isBlocked, recordFailedAttempt, clearAttempts } from '../lib/rate-limit'
import { GoogleSignInButton } from '../components/GoogleSignInButton'
import { motion } from 'framer-motion'

const FEATURES = [
  { icon: Star, text: 'Descontos exclusivos em produtos geek' },
  { icon: Zap, text: 'Acesso antecipado a lançamentos' },
  { icon: Shield, text: 'Programa de fidelidade com recompensas' },
  { icon: Gift, text: 'Brindes e surpresas todo mês' },
]

export default function Login() {
  const [searchParams] = useSearchParams()
  // Pre-fill email if it was passed via ?email=... (e.g. from Register's "email already exists" CTA)
  const [email, setEmail] = useState(() => searchParams.get('email') || '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [lockoutTime, setLockoutTime] = useState(0)

  const { user, role, loading, error, emailVerified, signIn, signInWithGoogle } = useAuth()
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

  // Verificar bloqueio quando email muda (usando callback para evitar cascading renders)
  useEffect(() => {
    if (email) {
      const { blocked, remainingTime } = isBlocked(email)
      if (blocked) {
        // Schedule state update to avoid synchronous setState in effect
        queueMicrotask(() => setLockoutTime(remainingTime))
      }
    }
  }, [email])

  // Redirecionar quando autenticado com role
  useEffect(() => {
    if (!loading && user && role) {
      // Membros com email não verificado retomam o cadastro
      if (role === 'member' && !emailVerified) {
        navigate('/cadastro', { replace: true })
        return
      }
      const path = getLoginRedirectPath(role, getAppMode())
      navigate(path, { replace: true })
    }
  }, [loading, user, role, emailVerified, navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')

    // Normalizar email
    const normalizedEmail = normalizeEmail(email)

    // Verificar rate limit
    const { blocked, remainingTime } = isBlocked(normalizedEmail)
    if (blocked) {
      setLockoutTime(remainingTime)
      setFormError('Muitas tentativas. Aguarde antes de tentar novamente.')
      return
    }

    setIsSubmitting(true)

    const result = await signIn(normalizedEmail, password)

    if (!result.success) {
      // Registrar tentativa falha
      const { blocked: nowBlocked, attemptsRemaining, lockoutSeconds } = recordFailedAttempt(normalizedEmail)

      if (nowBlocked) {
        setLockoutTime(lockoutSeconds)
        setFormError('Conta bloqueada temporariamente. Aguarde 5 minutos.')
      } else if (attemptsRemaining <= 2) {
        setFormError(`${result.error}. ${attemptsRemaining} tentativa(s) restante(s).`)
      } else {
        setFormError(result.error || 'Erro ao fazer login')
      }
    } else {
      // Limpar tentativas após sucesso
      clearAttempts(normalizedEmail)
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

  // Lockout progress (300s = 5 min total lockout)
  const lockoutTotal = 300
  const lockoutProgress = isLocked ? ((lockoutTotal - lockoutTime) / lockoutTotal) * 100 : 0

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* ── Left branding panel (desktop) / Top banner (mobile) ── */}
      <div className="relative flex flex-col items-center justify-center bg-primary/5 px-8 py-10 md:w-1/2 md:min-h-screen">
        {/* Decorative gradient blobs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 flex flex-col items-center text-center"
        >
          <img
            src="/logo-vip.png"
            alt="Clube Geek & Toys VIP"
            className="w-40 md:w-64 mb-6"
          />
          <h1 className="text-2xl md:text-3xl font-heading gradient-text mb-2">
            Clube Geek & Toys
          </h1>
          <p className="text-muted-foreground text-sm md:text-base mb-8">
            Seu clube de vantagens geek
          </p>

          {/* Feature highlights — hidden on small screens to keep it compact */}
          <ul className="hidden md:flex flex-col gap-4 w-full max-w-xs text-left">
            {FEATURES.map(({ icon: Icon, text }, index) => (
              <motion.li
                key={text}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.3 + index * 0.1 }}
                className="flex items-center gap-3 text-sm text-muted-foreground"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                {text}
              </motion.li>
            ))}
          </ul>
        </motion.div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex flex-1 items-center justify-center p-4 md:p-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="w-full max-w-md"
        >
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-heading">Bem-vindo de volta</CardTitle>
              <CardDescription>Acesse sua área de membro</CardDescription>
            </CardHeader>

            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4">
                {/* Google Sign-In */}
                <GoogleSignInButton
                  label="Entrar com Google"
                  disabled={isSubmitting || isLocked}
                  onSuccess={(data) => {
                    const result = signInWithGoogle(data)
                    if (!result.success) {
                      setFormError(result.error || 'Erro ao autenticar com Google')
                    }
                    // Redirect handled by useEffect watching user/role
                  }}
                  onError={(err) => setFormError(err)}
                />

                {/* Divider */}
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

                {/* Lockout banner */}
                {isLocked && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative overflow-hidden rounded-lg border border-red-500/50 bg-red-500/10 p-4"
                  >
                    {/* Progress bar along the bottom */}
                    <div className="absolute bottom-0 left-0 h-1 bg-red-500/30 w-full">
                      <motion.div
                        className="h-full bg-red-500"
                        initial={{ width: '0%' }}
                        animate={{ width: `${lockoutProgress}%` }}
                        transition={{ duration: 0.4 }}
                      />
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/20">
                        <ShieldAlert className="h-5 w-5 text-red-500" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-red-500 text-sm">Conta bloqueada</p>
                        <p className="text-xs text-red-400 mt-0.5">
                          Muitas tentativas falhas. Tente novamente em:
                        </p>
                        <span className="mt-1.5 inline-flex items-center rounded-md bg-red-500/20 px-2.5 py-1 text-sm font-mono font-semibold text-red-500 tabular-nums">
                          {formatTime(lockoutTime)}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Erro do formulario */}
                {formError && !isLocked && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 rounded-md bg-red-500/10 border border-red-500/50 text-red-500 text-sm"
                  >
                    {formError}
                  </motion.div>
                )}

                {/* Erro de autenticacao */}
                {error && !formError && !isLocked && (
                  <div className="p-3 rounded-md bg-orange-500/10 border border-orange-500/50 text-orange-600 text-sm">
                    <p className="font-medium mb-1">Usuário não cadastrado</p>
                    <p className="text-xs opacity-80">
                      Seu login existe mas você não está no sistema. Complete seu cadastro.
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

                <div className="text-right">
                  <Link to="/recuperar-senha" className="text-sm text-primary hover:underline">
                    Esqueceu a senha?
                  </Link>
                </div>
              </CardContent>

              <CardFooter className="flex-col gap-4">
                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={isSubmitting || isLocked}
                >
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

                {/* Prominent "Criar conta" CTA */}
                <div className="w-full rounded-lg border border-dashed border-primary/30 bg-primary/5 px-4 py-3 text-center">
                  <p className="text-sm text-muted-foreground">
                    Ainda não é membro?
                  </p>
                  <Link
                    to="/assinar"
                    className="mt-1 inline-block text-sm font-semibold text-primary hover:underline"
                  >
                    Criar conta e assinar
                  </Link>
                </div>
              </CardFooter>
            </form>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
