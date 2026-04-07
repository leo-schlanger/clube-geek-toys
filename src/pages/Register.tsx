import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '../contexts/AuthContext'
import { logger } from '../lib/logger'
import { sanitizeName, normalizeEmail, normalizePhone, normalizeCPF } from '../lib/sanitize'
import { validateEmail, type EmailValidationResult } from '../lib/email-validation'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Loading } from '../components/ui/loading'
import { PaymentModal } from '../components/PaymentModal'
import { ContractModal } from '../components/ContractModal'
import { PLANS, type PlanType, type PaymentType } from '../types'
import { formatCurrency, validateCPF } from '../lib/utils'
import { createMember, isCPFRegistered, updateMember } from '../lib/members'
import { sendWelcomeEmail, sendPaymentConfirmedEmail } from '../lib/email'
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
  const [showContractModal, setShowContractModal] = useState(false)
  const [contractSigned, setContractSigned] = useState(false)
  const [createdMemberId, setCreatedMemberId] = useState<string | null>(null)
  const [memberEmail, setMemberEmail] = useState<string>('')
  const [memberName, setMemberName] = useState<string>('')
  const [memberCPF, setMemberCPF] = useState<string>('')
  const [memberPhone, setMemberPhone] = useState<string>('')
  const [cpfValidation, setCpfValidation] = useState<CPFValidationResult | null>(null)
  const [validatingCpf, setValidatingCpf] = useState(false)
  const [emailValidation, setEmailValidation] = useState<EmailValidationResult | null>(null)
  const [validatingEmail, setValidatingEmail] = useState(false)

  // Rate limiting: max attempts for validation
  const [cpfValidationAttempts, setCpfValidationAttempts] = useState(0)
  const [emailValidationAttempts, setEmailValidationAttempts] = useState(0)
  const MAX_VALIDATION_ATTEMPTS = 5
  const VALIDATION_COOLDOWN_MS = 60000 // 1 minute cooldown after max attempts

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

    // Sanitizar inputs
    const sanitizedData = {
      fullName: sanitizeName(data.fullName),
      email: normalizeEmail(data.email),
      phone: normalizePhone(data.phone),
      cpf: normalizeCPF(data.cpf),
      password: data.password, // Senha não deve ser modificada
    }

    // Timeout helper
    const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> => {
      return Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMessage)), timeoutMs))
      ])
    }

    try {
      // 1. Validate email (format, disposable, domain)
      toast.loading('Etapa 1/4: Validando email...', { id: 'reg-progress' })
      const emailResult = await validateEmail(sanitizedData.email)

      if (!emailResult.valid) {
        toast.error(emailResult.error || 'Email inválido', { id: 'reg-progress' })
        setEmailValidation(emailResult)
        setLoading(false)
        return
      }

      // 2. Check if CPF is already registered (MUST succeed - no silent failures)
      toast.loading('Etapa 2/4: Verificando CPF...', { id: 'reg-progress' })
      let isRegistered: boolean
      try {
        isRegistered = await withTimeout(
          isCPFRegistered(sanitizedData.cpf),
          5000,
          'Tempo esgotado ao verificar CPF.'
        )
      } catch {
        // CRITICAL: Do NOT allow registration if CPF check fails
        // This prevents duplicate accounts when the server is slow
        toast.error('Não foi possível verificar o CPF. Tente novamente.', { id: 'reg-progress' })
        setLoading(false)
        return
      }

      if (isRegistered) {
        toast.error('Este CPF já está cadastrado', { id: 'reg-progress' })
        setLoading(false)
        return
      }

      // 3. Create account via API
      toast.loading('Etapa 3/4: Criando sua conta...', { id: 'reg-progress' })
      const result = await signUp(sanitizedData.email, sanitizedData.password)

      if (!result.success) {
        toast.error(result.error || 'Erro ao criar conta', { id: 'reg-progress' })
        setLoading(false)
        return
      }

      // 4. Create member record with retry logic
      // User is now authenticated via JWT (stored in localStorage by AuthContext)
      const newUserId = user?.id
      if (newUserId) {
        toast.loading('Etapa 4/4: Salvando dados...', { id: 'reg-progress' })

        // Retry member creation up to 3 times
        let member = null
        let lastError = null
        const maxRetries = 3

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            member = await withTimeout(
              createMember(user?.id || '', {
                fullName: sanitizedData.fullName,
                email: sanitizedData.email,
                cpf: sanitizedData.cpf,
                phone: sanitizedData.phone,
                plan: selectedPlan,
                paymentType: paymentType,
              }),
              5000,
              'Salvando dados...'
            )
            if (member) break // Success, exit loop
          } catch (err) {
            lastError = err
            logger.warn(`Member creation attempt ${attempt}/${maxRetries} failed:`, err)
            if (attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 1000 * attempt)) // Exponential backoff
            }
          }
        }

        if (member) {
          setCreatedMemberId(member.id)
          setMemberEmail(member.email)
          setMemberName(sanitizedData.fullName)
          setMemberCPF(sanitizedData.cpf)
          setMemberPhone(sanitizedData.phone)

          // 5. Show contract modal for signature (before payment)
          toast.success('Conta criada! Agora assine o contrato.', { id: 'reg-progress' })
          setShowContractModal(true)
        } else {
          // All retries failed - cannot proceed without member document
          // The member document is required for contract storage permissions
          logger.error('All member creation attempts failed:', lastError)
          toast.error('Erro ao criar seu cadastro. Por favor, tente novamente.', {
            id: 'reg-progress',
            duration: 8000,
            description: 'Se o problema persistir, entre em contato com o suporte.'
          })
          // Don't show contract modal - user needs to retry registration
          setLoading(false)
          return
        }
      }

    } catch (error) {
      logger.error('Error registering:', error)
      toast.error('Erro ao criar conta. Verifique sua conexão.', { id: 'reg-progress' })
    }

    setLoading(false)
  }

  /**
   * Handle contract signed - move to payment step
   */
  function handleContractSigned() {
    setShowContractModal(false)
    setContractSigned(true)
    setStep(3) // Move to payment step
    toast.success('Contrato assinado! Agora finalize o pagamento.')
  }

  /**
   * Handle successful payment - updates member status to active and sends emails
   */
  async function handlePaymentSuccess() {
    setShowPaymentModal(false)

    if (createdMemberId) {
      // Calculate expiry date based on payment type
      const now = new Date()
      const expiryDate = new Date(now)
      if (paymentType === 'monthly') {
        expiryDate.setMonth(expiryDate.getMonth() + 1)
      } else {
        expiryDate.setFullYear(expiryDate.getFullYear() + 1)
      }

      const expiryDateStr = expiryDate.toISOString().split('T')[0]

      // Update member status to active with retry
      let success = false
      let retryCount = 0
      const maxRetries = 3

      while (!success && retryCount < maxRetries) {
        success = await updateMember(createdMemberId, {
          status: 'active',
          startDate: now.toISOString().split('T')[0],
          expiryDate: expiryDateStr,
        })

        if (!success) {
          retryCount++
          if (retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount))
          }
        }
      }

      if (success) {
        toast.success('Pagamento confirmado! Bem-vindo ao Clube Geek & Toys!')

        // Send confirmation emails (non-blocking)
        const email = memberEmail
        const name = memberName || 'Membro'
        const planName = PLANS[selectedPlan].name

        // Send payment confirmation email
        sendPaymentConfirmedEmail(
          email,
          name,
          price,
          planName,
          expiryDateStr,
          createdMemberId
        ).catch(err => logger.error('Erro ao enviar email de confirmação:', err))

        // Send welcome email
        sendWelcomeEmail(
          email,
          name,
          planName,
          createdMemberId
        ).catch(err => logger.error('Erro ao enviar email de boas-vindas:', err))
      } else {
        // After all retries failed, show error with manual retry option
        toast.error('Pagamento recebido, mas houve um erro ao ativar sua conta.', {
          description: 'Entre em contato com o suporte ou tente fazer login novamente.',
          duration: 10000,
          action: {
            label: 'Tentar novamente',
            onClick: () => handlePaymentSuccess(),
          },
        })
        // Don't navigate - let user retry
        return
      }
    } else {
      toast.success('Pagamento confirmado! Bem-vindo ao clube!')
    }

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
   * Validate CPF via Brasil API (com debounce e rate limiting)
   */
  const cpfValidationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cpfRateLimitResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleValidateCPF = useCallback((cpf: string) => {
    const cleaned = cpf.replace(/\D/g, '')

    // Limpa timeout anterior
    if (cpfValidationTimeoutRef.current) {
      clearTimeout(cpfValidationTimeoutRef.current)
    }

    if (cleaned.length !== 11) {
      setCpfValidation(null)
      return
    }

    // Rate limiting: bloqueia se excedeu tentativas
    if (cpfValidationAttempts >= MAX_VALIDATION_ATTEMPTS) {
      setCpfValidation({
        valid: false,
        exists: null,
        message: 'Muitas tentativas. Aguarde 1 minuto.',
      })
      return
    }

    // Debounce de 500ms para evitar chamadas excessivas à API
    cpfValidationTimeoutRef.current = setTimeout(async () => {
      setValidatingCpf(true)
      setCpfValidation(null)
      setCpfValidationAttempts(prev => prev + 1)

      // Reset rate limit após cooldown
      if (!cpfRateLimitResetRef.current) {
        cpfRateLimitResetRef.current = setTimeout(() => {
          setCpfValidationAttempts(0)
          cpfRateLimitResetRef.current = null
        }, VALIDATION_COOLDOWN_MS)
      }

      const result = await fullCPFValidation(cleaned)
      setCpfValidation(result)
      setValidatingCpf(false)
    }, 500)
  }, [cpfValidationAttempts])

  /**
   * Validate Email (formato, domínio e temporário) com rate limiting
   */
  const emailValidationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const emailRateLimitResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleValidateEmail = useCallback((email: string) => {
    const trimmed = email.trim()

    // Limpa timeout anterior
    if (emailValidationTimeoutRef.current) {
      clearTimeout(emailValidationTimeoutRef.current)
    }

    // Validação básica de formato antes de chamar API
    if (!trimmed || !trimmed.includes('@') || trimmed.length < 5) {
      setEmailValidation(null)
      return
    }

    // Rate limiting: bloqueia se excedeu tentativas
    if (emailValidationAttempts >= MAX_VALIDATION_ATTEMPTS) {
      setEmailValidation({
        valid: false,
        error: 'Muitas tentativas. Aguarde 1 minuto.',
      })
      return
    }

    // Debounce de 500ms para evitar chamadas excessivas
    emailValidationTimeoutRef.current = setTimeout(async () => {
      setValidatingEmail(true)
      setEmailValidation(null)
      setEmailValidationAttempts(prev => prev + 1)

      // Reset rate limit após cooldown
      if (!emailRateLimitResetRef.current) {
        emailRateLimitResetRef.current = setTimeout(() => {
          setEmailValidationAttempts(0)
          emailRateLimitResetRef.current = null
        }, VALIDATION_COOLDOWN_MS)
      }

      const result = await validateEmail(trimmed)
      setEmailValidation(result)
      setValidatingEmail(false)
    }, 500)
  }, [emailValidationAttempts])

  // Cleanup dos timeouts no unmount
  useEffect(() => {
    return () => {
      if (cpfValidationTimeoutRef.current) {
        clearTimeout(cpfValidationTimeoutRef.current)
      }
      if (emailValidationTimeoutRef.current) {
        clearTimeout(emailValidationTimeoutRef.current)
      }
      if (cpfRateLimitResetRef.current) {
        clearTimeout(cpfRateLimitResetRef.current)
      }
      if (emailRateLimitResetRef.current) {
        clearTimeout(emailRateLimitResetRef.current)
      }
    }
  }, [])

  return (
    <div className="min-h-screen bg-background py-6 sm:py-8 px-4">
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
          <h1 className="text-2xl sm:text-3xl font-heading font-bold text-foreground">Criar Conta</h1>
          <p className="text-muted-foreground mt-2">
            Complete seu cadastro para ativar o plano {plan.name}
          </p>
        </div>

        {/* Progress Steps - 3 passos simplificados */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[
            { num: 1, label: 'Dados' },
            { num: 2, label: 'Contrato' },
            { num: 3, label: 'Pagamento' },
          ].map((s, index) => {
            // Determina se o passo está completo
            const isComplete =
              (s.num === 1 && step >= 3) || // Dados completos quando chega no contrato
              (s.num === 2 && contractSigned) || // Contrato completo quando assinado
              (s.num === 3 && false) // Pagamento nunca fica completo (redirect)

            // Determina se o passo está ativo
            const isActive =
              (s.num === 1 && step <= 2) ||
              (s.num === 2 && step >= 3 && !contractSigned) ||
              (s.num === 3 && contractSigned)

            return (
              <div key={s.num} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                      isComplete
                        ? 'bg-primary text-primary-foreground'
                        : isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {isComplete ? <Check className="h-4 w-4" /> : s.num}
                  </div>
                  <span className="text-xs text-muted-foreground mt-1 hidden sm:block">{s.label}</span>
                </div>
                {index < 2 && (
                  <div
                    className={`w-8 sm:w-12 h-1 mx-1 transition-colors ${
                      isComplete ? 'bg-primary' : 'bg-muted'
                    }`}
                  />
                )}
              </div>
            )
          })}
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
                              className={`pl-10 pr-10 ${
                                emailValidation
                                  ? emailValidation.valid
                                    ? 'border-green-500 focus-visible:ring-green-500'
                                    : 'border-red-500 focus-visible:ring-red-500'
                                  : ''
                              }`}
                              {...register('email')}
                              onChange={(e) => {
                                register('email').onChange(e)
                                setEmailValidation(null)
                              }}
                              onBlur={(e) => {
                                register('email').onBlur(e)
                                if (e.target.value.trim().length >= 5) {
                                  handleValidateEmail(e.target.value)
                                }
                              }}
                            />
                            {/* Validation indicator */}
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                              {validatingEmail && (
                                <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                              )}
                              {!validatingEmail && emailValidation && (
                                emailValidation.valid ? (
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-red-500" />
                                )
                              )}
                            </div>
                          </div>
                          {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
                          {emailValidation && !errors.email && (
                            <p className={`text-xs ${emailValidation.valid ? 'text-green-600' : 'text-red-500'}`}>
                              {emailValidation.valid
                                ? (emailValidation.warnings?.length ? emailValidation.warnings[0] : 'Email válido')
                                : emailValidation.error}
                            </p>
                          )}
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
                    {contractSigned
                      ? 'Contrato assinado! Agora finalize o pagamento para ativar seus benefícios.'
                      : 'Sua conta foi criada. Agora finalize o pagamento para ativar seus benefícios.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {contractSigned && (
                    <div className="flex items-center justify-center gap-2 text-sm text-green-600 bg-green-500/10 rounded-lg p-3">
                      <Check className="h-4 w-4" />
                      <span>Contrato assinado digitalmente</span>
                    </div>
                  )}
                  <p className="text-muted-foreground text-sm">
                    Você será redirecionado para o ambiente seguro do PagBank.
                  </p>
                  <Button
                    className="w-full h-12 text-lg"
                    onClick={() => setShowPaymentModal(true)}
                    disabled={!contractSigned}
                  >
                    Finalizar Pagamento
                  </Button>
                  {!contractSigned && (
                    <p className="text-xs text-muted-foreground">
                      Você precisa assinar o contrato antes de prosseguir com o pagamento.
                    </p>
                  )}
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

      {showContractModal && createdMemberId && (
        <ContractModal
          memberId={createdMemberId}
          memberName={memberName}
          memberCPF={memberCPF}
          memberEmail={memberEmail}
          memberPhone={memberPhone}
          plan={selectedPlan}
          paymentType={paymentType}
          onClose={() => {
            // Don't allow closing without signing
            toast.error('Você precisa assinar o contrato para continuar')
          }}
          onSigned={handleContractSigned}
        />
      )}

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
