import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Building2, Eye, EyeOff, LogIn, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { setTokens } from '../../lib/api-client'
import { loginWholesale } from '../../lib/wholesale'
import { maskCnpj, isValidCnpj, normalizeCnpj } from '../../lib/cnpj'
import { normalizeEmail } from '../../lib/sanitize'
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
import { SeoHead } from '../../components/store/SeoHead'

/**
 * Login do canal atacado: e-mail + senha + CNPJ (deve bater com o cadastro).
 */
export default function WholesaleLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { user, loading, refreshUser } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && user) {
      // Already logged in — still useful to land on atacado home
      navigate('/atacado', { replace: true })
    }
  }, [loading, user, navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')

    const digits = normalizeCnpj(cnpj)
    if (!isValidCnpj(digits)) {
      setFormError('Informe um CNPJ válido.')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await loginWholesale({
        email: normalizeEmail(email),
        password,
        cnpj: digits,
      })
      setTokens(result.accessToken, result.refreshToken)
      await refreshUser()
      toast.success(
        result.account.status === 'approved'
          ? 'Bem-vindo ao atacado!'
          : 'Login ok — cadastro ainda em análise.'
      )
      navigate('/atacado', { replace: true })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao entrar')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loading size="lg" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <SeoHead title="Entrar no Atacado | GeekPop & Toys" path="/atacado/entrar" />
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <Building2 className="h-6 w-6" />
            <span className="text-sm font-medium uppercase tracking-wide">Atacado B2B</span>
          </div>
          <CardTitle className="font-heading text-2xl">Entrar com CNPJ</CardTitle>
          <CardDescription>
            É obrigatório informar o CNPJ cadastrado. O desconto de 25% só vale após aprovação.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {formError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input
                id="cnpj"
                inputMode="numeric"
                autoComplete="off"
                placeholder="00.000.000/0000-00"
                value={cnpj}
                onChange={(e) => setCnpj(maskCnpj(e.target.value))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              <LogIn className="h-4 w-4" />
              {isSubmitting ? 'Entrando…' : 'Entrar no atacado'}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Ainda não tem cadastro?{' '}
              <Link to="/atacado/cadastro" className="font-medium text-primary hover:underline">
                Solicitar acesso
              </Link>
            </p>
            <Button variant="ghost" size="sm" asChild className="w-full">
              <Link to="/atacado">
                <ArrowLeft className="h-4 w-4" />
                Voltar ao catálogo atacado
              </Link>
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
