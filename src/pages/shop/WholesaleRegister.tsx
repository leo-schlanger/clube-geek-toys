import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Building2, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { setTokens } from '../../lib/api-client'
import { registerWholesale } from '../../lib/wholesale'
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
import { SeoHead } from '../../components/store/SeoHead'

/**
 * Cadastro atacadista: CNPJ + dados da empresa.
 * Starts as pending; an admin approves when the company's activity matches.
 */
export default function WholesaleRegister() {
  const navigate = useNavigate()
  const { refreshUser } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [tradeName, setTradeName] = useState('')
  const [contactName, setContactName] = useState('')
  const [phone, setPhone] = useState('')
  const [stateRegistration, setStateRegistration] = useState('')
  const [businessActivity, setBusinessActivity] = useState('')
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')

    const digits = normalizeCnpj(cnpj)
    if (!isValidCnpj(digits)) {
      setFormError('CNPJ inválido. Confira os dígitos.')
      return
    }
    if (password.length < 8) {
      setFormError('Senha deve ter no mínimo 8 caracteres.')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await registerWholesale({
        email: normalizeEmail(email),
        password,
        cnpj: digits,
        companyName: companyName.trim(),
        tradeName: tradeName.trim() || undefined,
        contactName: contactName.trim(),
        phone: phone.trim() || undefined,
        stateRegistration: stateRegistration.trim() || undefined,
        businessActivity: businessActivity.trim() || undefined,
      })
      setTokens(result.accessToken, result.refreshToken)
      await refreshUser()
      toast.success('Cadastro enviado! Aguarde a aprovação do CNPJ.')
      navigate('/atacado', { replace: true })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao cadastrar')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <SeoHead title="Cadastro Atacado | GeekPop & Toys" path="/atacado/cadastro" />
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <Building2 className="h-6 w-6" />
            <span className="text-sm font-medium uppercase tracking-wide">Atacado B2B</span>
          </div>
          <CardTitle className="font-heading text-2xl">Solicitar acesso</CardTitle>
          <CardDescription>
            Cadastre o CNPJ da empresa. Aprovamos contas cujo objeto social bate com o tipo de
            compra (revenda de produtos geek/colecionáveis). Desconto de 25% após aprovação.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {formError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="cnpj">CNPJ *</Label>
                <Input
                  id="cnpj"
                  inputMode="numeric"
                  placeholder="00.000.000/0000-00"
                  value={cnpj}
                  onChange={(e) => setCnpj(maskCnpj(e.target.value))}
                  required
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="companyName">Razão social *</Label>
                <Input
                  id="companyName"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tradeName">Nome fantasia</Label>
                <Input
                  id="tradeName"
                  value={tradeName}
                  onChange={(e) => setTradeName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stateRegistration">Inscrição estadual</Label>
                <Input
                  id="stateRegistration"
                  value={stateRegistration}
                  onChange={(e) => setStateRegistration(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactName">Responsável *</Label>
                <Input
                  id="contactName"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone / WhatsApp</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="businessActivity">
                  Atividade / o que vende (objeto da compra)
                </Label>
                <textarea
                  id="businessActivity"
                  rows={3}
                  placeholder="Ex.: loja de presentes e artigos geek, revenda de photocards e Funko Pop…"
                  value={businessActivity}
                  onChange={(e) => setBusinessActivity(e.target.value)}
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
                <p className="text-xs text-muted-foreground">
                  Usamos isso para conferir se o CNPJ está de acordo com o que você pretende
                  comprar no atacado.
                </p>
              </div>
              <div className="space-y-2 sm:col-span-2">
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
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="password">Senha * (mín. 8)</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Enviando…' : 'Enviar cadastro'}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Já tem conta?{' '}
              <Link to="/atacado/entrar" className="font-medium text-primary hover:underline">
                Entrar com CNPJ
              </Link>
            </p>
            <Button variant="ghost" size="sm" asChild className="w-full">
              <Link to="/atacado">
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Link>
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
