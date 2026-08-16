import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff, UserPlus, ArrowLeft, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { normalizeEmail } from '../../lib/sanitize'
import { updateProfile } from '../../lib/profile'
import { GENDERS, GENDER_LABELS, type Gender } from '../../types'
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
 * Cadastro da loja — cria conta **sem** assinar o clube.
 *
 * Só e-mail e senha são obrigatórios: exigir o resto aqui derrubaria a
 * conversão. Os campos de perfil ficam nesta mesma tela como opcionais porque é
 * onde a pessoa está mais disposta a preencher; endereço e foto ficam para
 * `/perfil`, já que endereço o checkout coleta de qualquer forma.
 */
export default function ShopRegister() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [gender, setGender] = useState<Gender | ''>('')
  const [marketingConsent, setMarketingConsent] = useState(false)
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { user, loading, signUp } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && user) {
      navigate('/perfil', { replace: true })
    }
  }, [loading, user, navigate])

  function validate(): string | null {
    if (!email.trim()) return 'Informe seu e-mail.'
    if (password.length < 8) return 'A senha precisa de pelo menos 8 caracteres.'
    if (!/[A-Z]/.test(password)) return 'A senha precisa de ao menos 1 letra maiúscula.'
    if (!/[0-9]/.test(password)) return 'A senha precisa de ao menos 1 número.'
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')

    const invalid = validate()
    if (invalid) {
      setFormError(invalid)
      return
    }

    setIsSubmitting(true)
    try {
      const result = await signUp(normalizeEmail(email), password)
      if (!result.success) {
        setFormError(result.error || 'Não foi possível criar a conta.')
        return
      }

      // A conta já existe e está autenticada. O perfil é um passo separado, e
      // uma falha aqui não pode desfazer o cadastro — a pessoa completa depois.
      const profileFields = {
        ...(fullName.trim() ? { fullName: fullName.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(birthDate ? { birthDate } : {}),
        ...(gender ? { gender } : {}),
        marketingConsent,
      }

      try {
        await updateProfile(profileFields)
      } catch {
        toast.info('Conta criada! Complete seu perfil quando quiser.')
      }

      navigate('/perfil', { replace: true })
    } catch {
      setFormError('Erro ao criar conta. Tente novamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) return <Loading />

  return (
    <div className="min-h-screen bg-background">
      <SeoHead
        title="Criar conta"
        description="Crie sua conta na loja GeekPop & Toys — salve produtos e acompanhe seus pedidos."
        path="/cadastro"
        noIndex
      />

      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-8">
        <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2 self-start text-muted-foreground">
          <Link to="/">
            <ArrowLeft className="h-4 w-4" />
            Voltar à loja
          </Link>
        </Button>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-2xl">Criar conta</CardTitle>
              <CardDescription>
                Salve produtos, acompanhe pedidos e receba novidades. Não precisa
                assinar o clube.
              </CardDescription>
            </CardHeader>

            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail *</Label>
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
                  <Label htmlFor="password">Senha *</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Mínimo 8 caracteres, com 1 maiúscula e 1 número.
                  </p>
                </div>

                <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-5">
                  <p className="text-sm font-medium">
                    Sobre você{' '}
                    <span className="font-normal text-muted-foreground">— opcional</span>
                  </p>

                  <div className="space-y-2">
                    <Label htmlFor="fullName">Nome</Label>
                    <Input
                      id="fullName"
                      autoComplete="name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input
                      id="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="(21) 99999-8888"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="birthDate">Data de nascimento</Label>
                    <Input
                      id="birthDate"
                      type="date"
                      autoComplete="bday"
                      max={new Date().toISOString().slice(0, 10)}
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="gender">Gênero</Label>
                    <select
                      id="gender"
                      value={gender}
                      onChange={(e) => setGender(e.target.value as Gender | '')}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">Selecione</option>
                      {GENDERS.map((value) => (
                        <option key={value} value={value}>
                          {GENDER_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={marketingConsent}
                      onChange={(e) => setMarketingConsent(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-input"
                    />
                    <span className="text-muted-foreground">
                      Quero receber novidades e promoções por e-mail.
                    </span>
                  </label>
                </div>

                {formError && (
                  <p role="alert" className="text-sm text-destructive">
                    {formError}
                  </p>
                )}

                <p className="text-xs text-muted-foreground">
                  Ao criar a conta você concorda com os{' '}
                  <Link to="/termos" className="underline">
                    Termos de Uso
                  </Link>{' '}
                  e a{' '}
                  <Link to="/privacidade" className="underline">
                    Política de Privacidade
                  </Link>
                  . Você pode editar ou apagar seus dados a qualquer momento.
                </p>
              </CardContent>

              <CardFooter className="flex-col gap-3">
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    'Criando conta...'
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4" />
                      Criar conta
                    </>
                  )}
                </Button>

                <p className="text-sm text-muted-foreground">
                  Já tem conta?{' '}
                  <Link to="/entrar" className="font-medium text-primary underline">
                    Entrar
                  </Link>
                </p>

                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-accent" />
                  Membros do clube têm 15% de desconto na loja
                </p>
              </CardFooter>
            </form>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
