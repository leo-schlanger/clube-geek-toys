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
import { createMember } from '../lib/members'
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
    watch,
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

    try {
      // 1. Create account in Firebase Auth
      const { error: authError } = await signUp(data.email, data.password)

      if (authError) {
        if (authError.message.includes('email-already-in-use')) {
          toast.error('Este email já está cadastrado')
        } else {
          toast.error('Erro ao criar conta: ' + authError.message)
        }
        setLoading(false)
        return
      }

      // 2. Move to payment step
      // Note: User is not immediately available after signUp
      setStep(3)
      toast.success('Conta criada! Agora finalize o pagamento.')

    } catch (error) {
      console.error('Error registering:', error)
      toast.error('Erro ao criar conta. Tente novamente.')
    }

    setLoading(false)
  }

  /**
   * Handle successful payment
   */
  async function handlePaymentSuccess() {
    setShowPaymentModal(false)

    // Create member after payment confirmed
    if (user) {
      await createMember(user.uid, {
        fullName: watch('fullName'),
        email: watch('email'),
        cpf: watch('cpf'),
        phone: watch('phone'),
        plan: selectedPlan,
        paymentType: paymentType,
      })
    }

    toast.success('Pagamento confirmado! Bem-vindo ao clube!')
    navigate('/membro')
  }

  /**
   * Format CPF input with mask
   */
  function formatCPFInput(value: string) {
    const numbers = value.replace(/\D/g, '')
    return numbers
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }

  /**
   * Format phone input with mask
   */
  function formatPhoneInput(value: string) {
    const numbers = value.replace(/\D/g, '')
    if (numbers.length <= 10) {
      return numbers
        .replace(/(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{4})(\d)/, '$1-$2')
    }
    return numbers
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-gray-900 to-pink-900 py-8 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <Link to="/assinar" className="inline-flex items-center text-white/70 hover:text-white mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para planos
          </Link>
          <h1 className="text-3xl font-bold text-white">Criar Conta</h1>
          <p className="text-white/70 mt-2">
            Complete seu cadastro para ativar o plano {plan.name}
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step >= s
                    ? 'bg-primary text-white'
                    : 'bg-white/20 text-white/50'
                }`}
              >
                {step > s ? <Check className="h-4 w-4" /> : s}
              </div>
              {s < 3 && (
                <div
                  className={`w-12 h-1 ${
                    step > s ? 'bg-primary' : 'bg-white/20'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Plan Summary */}
        <Card className="mb-6">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge variant={selectedPlan as 'silver' | 'gold' | 'black'}>
                {plan.icon} {plan.name}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {paymentType === 'monthly' ? 'Mensal' : 'Anual'}
              </span>
            </div>
            <span className="text-lg font-bold">{formatCurrency(price)}</span>
          </CardContent>
        </Card>

        {/* Step 1 & 2: Registration Form */}
        {step < 3 && (
          <Card>
            <CardHeader>
              <CardTitle>
                {step === 1 ? 'Dados Pessoais' : 'Criar Senha'}
              </CardTitle>
              <CardDescription>
                {step === 1
                  ? 'Preencha seus dados para continuar'
                  : 'Crie uma senha para acessar sua conta'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {step === 1 && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="fullName">Nome Completo</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="fullName"
                          placeholder="Seu nome completo"
                          className="pl-10"
                          {...register('fullName')}
                          error={!!errors.fullName}
                        />
                      </div>
                      {errors.fullName && (
                        <p className="text-xs text-red-500">{errors.fullName.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="email"
                          type="email"
                          placeholder="seu@email.com"
                          className="pl-10"
                          {...register('email')}
                          error={!!errors.email}
                        />
                      </div>
                      {errors.email && (
                        <p className="text-xs text-red-500">{errors.email.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="cpf">CPF</Label>
                      <div className="relative">
                        <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="cpf"
                          placeholder="000.000.000-00"
                          className="pl-10"
                          {...register('cpf')}
                          onChange={(e) => {
                            e.target.value = formatCPFInput(e.target.value)
                          }}
                          maxLength={14}
                          error={!!errors.cpf}
                        />
                      </div>
                      {errors.cpf && (
                        <p className="text-xs text-red-500">{errors.cpf.message}</p>
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
                          onChange={(e) => {
                            e.target.value = formatPhoneInput(e.target.value)
                          }}
                          maxLength={15}
                          error={!!errors.phone}
                        />
                      </div>
                      {errors.phone && (
                        <p className="text-xs text-red-500">{errors.phone.message}</p>
                      )}
                    </div>

                    <Button
                      type="button"
                      className="w-full"
                      onClick={() => setStep(2)}
                    >
                      Continuar
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </>
                )}

                {step === 2 && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="password">Senha</Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Mínimo 6 caracteres"
                          {...register('password')}
                          error={!!errors.password}
                        />
                        <button
                          type="button"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {errors.password && (
                        <p className="text-xs text-red-500">{errors.password.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                      <Input
                        id="confirmPassword"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Digite a senha novamente"
                        {...register('confirmPassword')}
                        error={!!errors.confirmPassword}
                      />
                      {errors.confirmPassword && (
                        <p className="text-xs text-red-500">{errors.confirmPassword.message}</p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1"
                        onClick={() => setStep(1)}
                      >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Voltar
                      </Button>
                      <Button type="submit" className="flex-1" disabled={loading}>
                        {loading ? (
                          <Loading size="sm" />
                        ) : (
                          <>
                            Criar Conta
                            <ArrowRight className="h-4 w-4 ml-2" />
                          </>
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </form>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Payment */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Finalizar Pagamento</CardTitle>
              <CardDescription>
                Escolha a forma de pagamento para ativar seu plano
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full"
                size="lg"
                onClick={() => setShowPaymentModal(true)}
              >
                <CreditCard className="h-5 w-5 mr-2" />
                Pagar {formatCurrency(price)}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Already have account */}
        <p className="text-center text-white/70 mt-6">
          Já tem uma conta?{' '}
          <Link to="/login" className="text-primary hover:underline">
            Fazer login
          </Link>
        </p>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <PaymentModal
          plan={selectedPlan}
          paymentType={paymentType}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  )
}
