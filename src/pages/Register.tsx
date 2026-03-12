import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Loading } from '../components/ui/loading'
import { PaymentModal } from '../components/PaymentModal'
import { PLANS, type PlanType, type PaymentType } from '../types'
import { formatCurrency, validateCPF } from '../lib/utils'
import { createMember, isCPFRegistered } from '../lib/members'
import { fullCPFValidation, type CPFValidationResult } from '../lib/cpf-validation'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  User,
  Mail,
  Phone,
  CreditCard,
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle,
  XCircle,
  HelpCircle,
} from 'lucide-react'

// Form validation schema
const registerSchema = z.object({
  fullName: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
  confirmPassword: z.string(),
  cpf: z.string().refine((val) => validateCPF(val), 'CPF inválido'),
  phone: z.string().min(10, 'Telefone inválido'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Senhas não conferem',
  path: ['confirmPassword'],
})

type RegisterFormData = z.infer<typeof registerSchema>

export default function Register() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { signUp, user } = useAuth()

  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [createdMemberId, setCreatedMemberId] = useState<string | null>(null)
  const [memberEmail, setMemberEmail] = useState<string>('')
  const [cpfValidation, setCpfValidation] = useState<CPFValidationResult | null>(null)
  const [validatingCpf, setValidatingCpf] = useState(false)

  // Get plan from URL params
  const planParam = searchParams.get('plano') as PlanType || 'silver'
  const typeParam = searchParams.get('tipo') as PaymentType || 'monthly'

  const [selectedPlan] = useState<PlanType>(planParam)
  const [paymentType] = useState<PaymentType>(typeParam)

  const plan = PLANS[selectedPlan]
  const price = paymentType === 'monthly' ? plan.priceMonthly : plan.priceAnnual

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  })

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate('/membro')
    }
  }, [user, navigate])

  /**
   * Handle form submission
   */
  async function onSubmit(data: RegisterFormData) {
    setLoading(true)

    // Timeout helper
    const withTimeout = (promise: Promise<any>, timeoutMs: number, errorMessage: string) => {
      return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(errorMessage)), timeoutMs))
      ])
    }

    try {
      // 1. Check if CPF is already registered (MUST succeed - no silent failures)
      toast.loading('Verificando CPF...', { id: 'reg-status' })
      let isRegistered: boolean
      try {
        isRegistered = await withTimeout(
          isCPFRegistered(data.cpf),
          5000,
          'Tempo esgotado ao verificar CPF.'
        )
      } catch (cpfError) {
        // CRITICAL: Do NOT allow registration if CPF check fails
        // This prevents duplicate accounts when Firestore is slow
        toast.error('Não foi possível verificar o CPF. Tente novamente.', { id: 'reg-status' })
        setLoading(false)
        return
      }

      if (isRegistered) {
        toast.error('Este CPF já está cadastrado', { id: 'reg-status' })
        setLoading(false)
        return
      }

      // 2. Create account in Firebase Auth
      toast.loading('Criando sua conta...', { id: 'reg-status' })
      const result = await signUp(data.email, data.password)

      if (!result.success) {
        toast.error(result.error || 'Erro ao criar conta', { id: 'reg-status' })
        setLoading(false)
        return
      }

      // 3. Create member record immediately (pending status)
      // After signUp, user is automatically signed in and available via auth.currentUser
      const { auth } = await import('../lib/firebase')
      const newUser = auth.currentUser

      if (newUser) {
        toast.loading('Finalizando cadastro...', { id: 'reg-status' })
        try {
          const member = await withTimeout(
            createMember(newUser.uid, {
              fullName: data.fullName,
              email: data.email,
              cpf: data.cpf,
              phone: data.phone,
              plan: selectedPlan,
              paymentType: paymentType,
            }),
            5000,
            'Cadastro finalizado com resiliência.'
          )

          if (member) {
            setCreatedMemberId(member.id)
            setMemberEmail(member.email)
          }
        } catch (memberError) {
          console.warn('Member doc creation timed out or failed, but auth succeeded:', memberError)
        }
      }

      // 4. Move to payment step
      setStep(3)
      toast.success('Conta criada! Agora finalize o pagamento.', { id: 'reg-status' })

    } catch (error) {
      console.error('Error registering:', error)
      toast.error('Erro ao criar conta. Verifique sua conexão.', { id: 'reg-status' })
    }

    setLoading(false)
  }

  /**
   * Handle successful payment
   */
  async function handlePaymentSuccess() {
    setShowPaymentModal(false)
    toast.success('Pagamento confirmado! Bem-vindo ao clube!')
    navigate('/membro')
  }

  /**
   * Format CPF input with mask
   */
  function handleCPFChange(e: React.ChangeEvent<HTMLInputElement>) {
    let value = e.target.value.replace(/\D/g, '')
    if (value.length > 11) value = value.slice(0, 11)

    const formattedValue = value
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')

    setValue('cpf', formattedValue)
  }

  /**
   * Format phone input with mask
   */
  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    let value = e.target.value.replace(/\D/g, '')
    if (value.length > 11) value = value.slice(0, 11)

    let formattedValue = ''
    if (value.length <= 10) {
      formattedValue = value
        .replace(/(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{4})(\d)/, '$1-$2')
    } else {
      formattedValue = value
        .replace(/(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{5})(\d)/, '$1-$2')
    }

    setValue('phone', formattedValue)
  }

  /**
   * Validate CPF via Brasil API
   */
  async function handleValidateCPF(cpf: string) {
    const cleaned = cpf.replace(/\D/g, '')
    if (cleaned.length !== 11) {
      setCpfValidation(null)
      return
    }

    setValidatingCpf(true)
    setCpfValidation(null)

    const result = await fullCPFValidation(cleaned)
    setCpfValidation(result)
    setValidatingCpf(false)
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <motion.div
        className="max-w-lg mx-auto"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header */}
        <div className="text-center mb-8">
          <Link to="/assinar" className="inline-flex items-center text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para planos
          </Link>
          <div className="mb-4">
            <img src="/logo.jpg" alt="Geek & Toys" className="h-14 rounded mx-auto" />
          </div>
          <h1 className="text-3xl font-heading font-bold text-foreground">Criar Conta</h1>
          <p className="text-muted-foreground mt-2">
            Complete seu cadastro para ativar o plano {plan.name}
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${step >= s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
              >
                {step > s ? <Check className="h-4 w-4" /> : s}
              </div>
              {s < 3 && (
                <div
                  className={`w-12 h-1 transition-colors ${step > s ? 'bg-primary' : 'bg-muted'}`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Plan Summary */}
        <Card className="mb-6 border-glow-primary bg-primary/5">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge variant={selectedPlan as 'silver' | 'gold' | 'black'}>
                {plan.name}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {paymentType === 'monthly' ? 'Mensal' : 'Anual'}
              </span>
            </div>
            <span className="text-lg font-bold">{formatCurrency(price)}</span>
          </CardContent>
        </Card>

        {/* Form Steps */}
        <AnimatePresence mode="wait">
          {step < 3 ? (
            <motion.div
              key="step-form"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.3 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>{step === 1 ? 'Dados Pessoais' : 'Segurança'}</CardTitle>
                  <CardDescription>
                    {step === 1 ? 'Preencha seus dados para começar' : 'Crie uma senha de acesso'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    {step === 1 && (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="fullName">Nome Completo</Label>
                          <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              id="fullName"
                              placeholder="Como na sua identidade"
                              className="pl-10"
                              {...register('fullName')}
                            />
                          </div>
                          {errors.fullName && <p className="text-xs text-red-500">{errors.fullName.message}</p>}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="email">E-mail</Label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              id="email"
                              type="email"
                              placeholder="seu@email.com"
                              className="pl-10"
                              {...register('email')}
                            />
                          </div>
                          {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="cpf">CPF</Label>
                            <div className="relative">
                              <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                id="cpf"
                                placeholder="000.000.000-00"
                                className={`pl-10 pr-10 ${
                                  cpfValidation
                                    ? cpfValidation.valid
                                      ? 'border-green-500 focus-visible:ring-green-500'
                                      : 'border-red-500 focus-visible:ring-red-500'
                                    : ''
                                }`}
                                {...register('cpf')}
                                onChange={(e) => {
                                  handleCPFChange(e)
                                  setCpfValidation(null)
                                }}
                                onBlur={(e) => {
                                  if (e.target.value.replace(/\D/g, '').length === 11) {
                                    handleValidateCPF(e.target.value)
                                  }
                                }}
                              />
                              {/* Validation indicator */}
                              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                {validatingCpf && (
                                  <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                                )}
                                {!validatingCpf && cpfValidation && (
                                  cpfValidation.valid ? (
                                    cpfValidation.exists === true ? (
                                      <CheckCircle className="h-4 w-4 text-green-500" />
                                    ) : cpfValidation.exists === null ? (
                                      <HelpCircle className="h-4 w-4 text-yellow-500" />
                                    ) : (
                                      <XCircle className="h-4 w-4 text-red-500" />
                                    )
                                  ) : (
                                    <XCircle className="h-4 w-4 text-red-500" />
                                  )
                                )}
                              </div>
                            </div>
                            {errors.cpf && <p className="text-xs text-red-500">{errors.cpf.message}</p>}
                            {cpfValidation && !errors.cpf && (
                              <p className={`text-xs ${
                                cpfValidation.valid
                                  ? cpfValidation.exists === true
                                    ? 'text-green-600'
                                    : 'text-yellow-600'
                                  : 'text-red-500'
                              }`}>
                                {cpfValidation.message}
                              </p>
                            )}
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="phone">Telefone</Label>
                            <div className="relative">
                              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                id="phone"
                                placeholder="(21) 99999-9999"
                                className="pl-10"
                                {...register('phone')}
                                onChange={handlePhoneChange}
                              />
                            </div>
                            {errors.phone && <p className="text-xs text-red-500">{errors.phone.message}</p>}
                          </div>
                        </div>

                        <Button type="button" className="w-full" onClick={() => setStep(2)}>
                          Próximo Passo <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    )}

                    {step === 2 && (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="password">Senha</Label>
                          <div className="relative">
                            <Input
                              id="password"
                              type={showPassword ? 'text' : 'password'}
                              placeholder="No mínimo 6 caracteres"
                              {...register('password')}
                            />
                            <button
                              type="button"
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                              onClick={() => setShowPassword(!showPassword)}
                            >
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                          {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                          <Input
                            id="confirmPassword"
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Repita sua senha"
                            {...register('confirmPassword')}
                          />
                          {errors.confirmPassword && <p className="text-xs text-red-500">{errors.confirmPassword.message}</p>}
                        </div>

                        <div className="flex gap-3">
                          <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(1)}>
                            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
                          </Button>
                          <Button type="submit" className="flex-1" disabled={loading}>
                            {loading ? <Loading size="sm" /> : 'Criar Conta'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </form>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="step-payment"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="text-center p-6">
                <CardHeader>
                  <CardTitle>Quase lá!</CardTitle>
                  <CardDescription>
                    Sua conta foi criada. Agora finalize o pagamento para ativar seus benefícios.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground text-sm">
                    Você será redirecionado para o ambiente seguro do Mercado Pago.
                  </p>
                  <Button className="w-full h-12 text-lg" onClick={() => setShowPaymentModal(true)}>
                    Finalizar Pagamento
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-center text-muted-foreground mt-8 text-sm">
          Já tem uma conta? <Link to="/login" className="text-primary hover:underline font-medium">Fazer Login</Link>
        </p>

        <div className="mt-8 flex justify-center gap-4 text-xs text-muted-foreground/60">
          <Link to="/termos" className="hover:text-foreground hover:underline">Termos de Uso</Link>
          <span>•</span>
          <Link to="/privacidade" className="hover:text-foreground hover:underline">Privacidade</Link>
        </div>
      </motion.div>

      {showPaymentModal && (
        <PaymentModal
          plan={selectedPlan}
          paymentType={paymentType}
          memberId={createdMemberId || undefined}
          memberEmail={memberEmail || undefined}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  )
}
