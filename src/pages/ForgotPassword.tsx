import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { normalizeEmail } from '../lib/sanitize'
import { sendPasswordResetEmail } from '../lib/email'
import { api } from '../lib/api-client'
import { PASSWORD_MIN_LENGTH } from '../lib/password-validation'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card'
import { Loading } from '../components/ui/loading'
import { ArrowLeft, Mail, CheckCircle, Eye, EyeOff, Shield, Lock } from 'lucide-react'

export default function ForgotPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  // If token is present, show password reset form
  if (token) {
    return <ResetPasswordForm token={token} />
  }

  // Otherwise, show email request form
  return <RequestResetForm />
}

/**
 * Form to request a password reset email
 */
function RequestResetForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const normalizedEmail = normalizeEmail(email)
      const result = await sendPasswordResetEmail(normalizedEmail)

      if (result.success) {
        setSent(true)
      } else {
        setError(result.error || 'Erro ao enviar email. Tente novamente.')
      }
    } catch {
      setError('Erro ao enviar email. Tente novamente.')
    }

    setLoading(false)
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-4 bg-green-500/20 rounded-full w-fit">
              <CheckCircle className="h-12 w-12 text-green-500" />
            </div>
            <CardTitle className="text-2xl">Email Enviado!</CardTitle>
            <CardDescription>
              Enviamos um link para redefinir sua senha para <strong>{email}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            <p>Verifique sua caixa de entrada e spam.</p>
            <p className="mt-2">O link expira em 1 hora.</p>
          </CardContent>
          <CardFooter>
            <Link to="/login" className="w-full">
              <Button variant="outline" className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar para o login
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <img src="/logo-vip.png" alt="Clube GeekPop & Toys" className="w-48 sm:w-56 mx-auto" />
          </div>
          <CardTitle className="text-2xl font-heading">Recuperar Senha</CardTitle>
          <CardDescription>
            Digite seu email para receber um link de redefinição
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 rounded-md bg-red-500/10 border border-red-500/50 text-red-500 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                  disabled={loading}
                />
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex-col gap-4">
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={loading || !email}
            >
              {loading ? (
                <Loading size="sm" />
              ) : (
                'Enviar Link de Recuperação'
              )}
            </Button>

            <Link
              to="/login"
              className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar para o login
            </Link>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}

/**
 * Form to set a new password using the reset token
 */
function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  // Password strength meter
  const passwordStrength = (() => {
    if (!password) return { score: 0, label: '', color: '', width: '0%' }
    let score = 0
    if (password.length >= 8) score++
    if (/[A-Z]/.test(password)) score++
    if (/[0-9]/.test(password)) score++
    if (/[!@#$%^&*]/.test(password)) score++
    const levels = [
      { label: '', color: '', width: '0%' },
      { label: 'Fraca', color: 'bg-red-500', width: '25%' },
      { label: 'Razoável', color: 'bg-orange-500', width: '50%' },
      { label: 'Boa', color: 'bg-yellow-500', width: '75%' },
      { label: 'Forte', color: 'bg-green-500', width: '100%' },
    ]
    return { score, ...levels[score] }
  })()

  // Validate password client-side
  const passwordErrors: string[] = []
  if (password && password.length < PASSWORD_MIN_LENGTH) {
    passwordErrors.push(`Mínimo ${PASSWORD_MIN_LENGTH} caracteres`)
  }
  if (password && !/[A-Z]/.test(password)) {
    passwordErrors.push('Pelo menos 1 letra maiúscula')
  }
  if (password && !/[0-9]/.test(password)) {
    passwordErrors.push('Pelo menos 1 número')
  }

  const isValid =
    password.length >= PASSWORD_MIN_LENGTH &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    password === confirmPassword

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('As senhas não conferem.')
      return
    }

    if (!isValid) {
      setError('A senha não atende aos requisitos mínimos.')
      return
    }

    setLoading(true)
    try {
      const result = await api.post('/auth/reset-password', { token, password }, { skipAuth: true })

      if (result.error) {
        if (result.error.includes('expirado') || result.error.includes('inválido') || result.error.includes('expired') || result.error.includes('invalid')) {
          setError('O link expirou ou é inválido. Solicite um novo link de recuperação.')
        } else {
          setError(result.error)
        }
      } else {
        setSuccess(true)
      }
    } catch {
      setError('Erro ao redefinir senha. Tente novamente.')
    }

    setLoading(false)
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-4 bg-green-500/20 rounded-full w-fit">
              <CheckCircle className="h-12 w-12 text-green-500" />
            </div>
            <CardTitle className="text-2xl">Senha Redefinida!</CardTitle>
            <CardDescription>
              Sua senha foi alterada com sucesso. Faça login com sua nova senha.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Link to="/login" className="w-full">
              <Button className="w-full" size="lg">
                Fazer Login
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <img src="/logo-vip.png" alt="Clube GeekPop & Toys" className="w-48 sm:w-56 mx-auto" />
          </div>
          <CardTitle className="text-2xl font-heading">Nova Senha</CardTitle>
          <CardDescription>
            Crie sua nova senha de acesso
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 rounded-md bg-red-500/10 border border-red-500/50 text-red-500 text-sm">
                {error}
                {error.includes('expirou') && (
                  <Link to="/recuperar-senha" className="block mt-2 underline text-primary">
                    Solicitar novo link
                  </Link>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">Nova Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={`No mínimo ${PASSWORD_MIN_LENGTH} caracteres`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {password && passwordErrors.length > 0 && (
                <ul className="text-xs text-red-500 space-y-0.5">
                  {passwordErrors.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              )}
              {password && (
                <div className="space-y-1">
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${passwordStrength.color}`}
                      style={{ width: passwordStrength.width }}
                    />
                  </div>
                  {passwordStrength.label && (
                    <div className="flex items-center gap-1">
                      <Shield className="h-3 w-3 text-muted-foreground" />
                      <span className={`text-xs ${
                        passwordStrength.score <= 1 ? 'text-red-500' :
                        passwordStrength.score === 2 ? 'text-orange-500' :
                        passwordStrength.score === 3 ? 'text-yellow-600' :
                        'text-green-600'
                      }`}>
                        {passwordStrength.label}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                placeholder="Repita sua nova senha"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={loading}
              />
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-red-500">Senhas não conferem</p>
              )}
            </div>
          </CardContent>

          <CardFooter className="flex-col gap-4">
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={loading || !isValid}
            >
              {loading ? (
                <Loading size="sm" />
              ) : (
                'Redefinir Senha'
              )}
            </Button>

            <Link
              to="/login"
              className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar para o login
            </Link>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
