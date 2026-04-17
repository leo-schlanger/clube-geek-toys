import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { logger } from '../lib/logger'
import { normalizeEmail, normalizeCPF } from '../lib/sanitize'
import { validateEmail } from '../lib/email-validation'
import { createMember, isCPFRegistered } from '../lib/members'
import { getMemberByUserId } from '../lib/members'
import { getMemberContract } from '../lib/contract-storage'
import { PLANS, type PlanType, type PaymentType, type ContractData } from '../types'
import { formatCurrency } from '../lib/utils'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { Card, CardContent } from '../components/ui/card'

// Registration step components
import { RegistrationStepper } from '../components/registration/RegistrationStepper'
import { StepAccount } from '../components/registration/StepAccount'
import { StepPersonalData } from '../components/registration/StepPersonalData'
import { StepEmailVerification } from '../components/registration/StepEmailVerification'
import { StepContract } from '../components/registration/StepContract'
import { StepPayment } from '../components/registration/StepPayment'

// ─── Constants ──────────────────────────────────────────────────────────────
const DRAFT_KEY = 'clube_geek_register_draft'

export default function Register() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { signUp, signInWithGoogle, user, sendVerificationEmail, refreshUser, emailVerified } = useAuth()

  // ─── State ──────────────────────────────────────────────────────────────────
  const [step, setStep] = useState(1) // 1=Account, 2=PersonalData, 3=Email, 4=Contract, 5=Payment
  const [loading, setLoading] = useState(false)
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())

  // Member data accumulated across steps
  const [memberData, setMemberData] = useState({
    email: '',
    fullName: '',
    cpf: '',
    phone: '',
    memberId: '',
  })
  const [selectedPlan, setSelectedPlan] = useState<PlanType>(
    (searchParams.get('plano') as PlanType) || 'silver'
  )
  const [paymentType, setPaymentType] = useState<PaymentType>(
    (searchParams.get('tipo') as PaymentType) || 'monthly'
  )

  // Flow flags
  const [accountAlreadyExists, setAccountAlreadyExists] = useState(false)
  const [initialCheckDone, setInitialCheckDone] = useState(false)

  // Draft state
  const [showDraftPrompt, setShowDraftPrompt] = useState(false)
  const draftCheckedRef = useRef(false)

  // Double-submit guard
  const isSubmittingRef = useRef(false)

  const plan = PLANS[selectedPlan]
  const price = paymentType === 'monthly' ? plan.priceMonthly : plan.priceAnnual

  // ─── Check for returning user ─────────────────────────────────────────────
  useEffect(() => {
    if (initialCheckDone || !user) return

    async function checkExistingMember() {
      try {
        const member = await getMemberByUserId(user!.id)
        if (member) {
          setMemberData({
            email: member.email,
            fullName: member.fullName,
            cpf: member.cpf,
            phone: member.phone || '',
            memberId: member.id,
          })
          setSelectedPlan(member.plan as PlanType)
          setPaymentType(member.paymentType as PaymentType)

          if (member.status === 'active') {
            navigate('/membro', { replace: true })
            return
          }

          const contract = await getMemberContract(member.id)
          if (contract) {
            completeStep(1); completeStep(2); completeStep(3); completeStep(4)
            setStep(5)
          } else if (emailVerified) {
            completeStep(1); completeStep(2); completeStep(3)
            setStep(4)
          } else {
            completeStep(1); completeStep(2)
            setStep(3)
          }
        } else if (user) {
          // User has account but no member record
          setMemberData(prev => ({ ...prev, email: user.email }))
          setAccountAlreadyExists(true)
          setStep(2) // Skip account creation
          completeStep(1)
        }
      } catch (err) {
        logger.debug('No existing member found:', err)
        if (user) {
          setMemberData(prev => ({ ...prev, email: user.email }))
          setAccountAlreadyExists(true)
          setStep(2)
          completeStep(1)
        }
      } finally {
        setInitialCheckDone(true)
      }
    }

    checkExistingMember()
  }, [user, emailVerified, initialCheckDone, navigate])

  // ─── Draft auto-save ──────────────────────────────────────────────────────
  useEffect(() => {
    if (draftCheckedRef.current) return
    draftCheckedRef.current = true
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const draft = JSON.parse(raw)
        if (draft?.fullName) setShowDraftPrompt(true)
      }
    } catch { /* ignore corrupt data */ }
  }, [])

  // Save draft on step 1-2 data changes
  useEffect(() => {
    if (step > 2 || !memberData.fullName) return
    const timeout = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        fullName: memberData.fullName,
        phone: memberData.phone,
        plan: selectedPlan,
        paymentType,
        step,
      }))
    }, 2000)
    return () => clearTimeout(timeout)
  }, [memberData.fullName, memberData.phone, selectedPlan, paymentType, step])

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function completeStep(n: number) {
    setCompletedSteps(prev => new Set(prev).add(n))
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const draft = JSON.parse(raw)
        if (draft.fullName) setMemberData(prev => ({ ...prev, fullName: draft.fullName, phone: draft.phone || '' }))
        if (draft.plan) setSelectedPlan(draft.plan)
        if (draft.paymentType) setPaymentType(draft.paymentType)
        toast.success('Cadastro em andamento restaurado.')
      }
    } catch { /* ignore */ }
    setShowDraftPrompt(false)
  }

  function discardDraft() {
    localStorage.removeItem(DRAFT_KEY)
    setShowDraftPrompt(false)
    toast.info('Formulario limpo.')
  }

  // ─── Step handlers ────────────────────────────────────────────────────────

  const handleAccountCreated = useCallback(async (data: { email: string; password: string }) => {
    if (isSubmittingRef.current) return
    isSubmittingRef.current = true
    setLoading(true)

    try {
      // Validate email
      toast.loading('Validando email...', { id: 'reg-progress' })
      const emailResult = await validateEmail(data.email)
      if (!emailResult.valid) {
        toast.error(emailResult.error || 'Email invalido', { id: 'reg-progress' })
        return
      }

      // Create account
      toast.loading('Criando sua conta...', { id: 'reg-progress' })
      const result = await signUp(data.email, data.password)
      if (!result.success) {
        if (result.error === 'Email ja cadastrado') {
          toast.error('Este email ja esta cadastrado.', {
            id: 'reg-progress',
            duration: 8000,
            description: 'Se voce esqueceu a senha, use "Esqueci minha senha" na tela de login.',
            action: {
              label: 'Fazer login',
              onClick: () => navigate(`/login?email=${encodeURIComponent(data.email)}`),
            },
          })
        } else {
          toast.error(result.error || 'Erro ao criar conta', { id: 'reg-progress' })
        }
        return
      }

      setMemberData(prev => ({ ...prev, email: data.email }))
      toast.success('Conta criada!', { id: 'reg-progress' })
      completeStep(1)
      setStep(2)
    } catch (error) {
      logger.error('Error creating account:', error)
      toast.error('Erro ao criar conta. Verifique sua conexao.', { id: 'reg-progress' })
    } finally {
      setLoading(false)
      isSubmittingRef.current = false
    }
  }, [signUp, navigate])

  const handleGoogleSuccess = useCallback((data: Record<string, unknown>) => {
    const result = signInWithGoogle(data)
    if (result.success) {
      if (result.isNewUser) {
        setMemberData(prev => ({
          ...prev,
          fullName: result.googleName || '',
          email: data.user?.email || '',
        }))
        toast.success('Conta Google conectada! Complete seus dados.')
        completeStep(1)
        setStep(2)
      } else {
        toast.success('Bem-vindo de volta!')
        navigate('/membro')
      }
    } else {
      toast.error(result.error || 'Erro ao autenticar com Google')
    }
  }, [signInWithGoogle, navigate])

  const handlePersonalDataComplete = useCallback(async (data: {
    fullName: string; cpf: string; phone: string; plan: PlanType; paymentType: PaymentType
  }) => {
    if (isSubmittingRef.current) return
    isSubmittingRef.current = true
    setLoading(true)

    try {
      // Check CPF
      toast.loading('Verificando CPF...', { id: 'reg-progress' })
      let isRegistered: boolean
      try {
        isRegistered = await Promise.race([
          isCPFRegistered(normalizeCPF(data.cpf)),
          new Promise<boolean>((_, reject) => setTimeout(() => reject('timeout'), 5000)),
        ]) as boolean
      } catch {
        toast.error('Nao foi possivel verificar o CPF. Tente novamente.', { id: 'reg-progress' })
        return
      }

      if (isRegistered) {
        toast.error('Este CPF ja esta cadastrado', { id: 'reg-progress' })
        return
      }

      // Create member record
      toast.loading('Salvando dados...', { id: 'reg-progress' })
      const userId = user?.id || ''
      let member = null
      let lastError = null

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          member = await Promise.race([
            createMember(userId, {
              fullName: data.fullName,
              email: memberData.email || normalizeEmail(data.fullName),
              cpf: normalizeCPF(data.cpf),
              phone: data.phone,
              plan: data.plan,
              paymentType: data.paymentType,
            }),
            new Promise<null>((_, reject) => setTimeout(() => reject('timeout'), 5000)),
          ])
          if (member) break
        } catch (err) {
          lastError = err
          logger.warn(`Member creation attempt ${attempt}/3 failed:`, err)
          if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt))
        }
      }

      if (member) {
        setMemberData(prev => ({
          ...prev,
          fullName: data.fullName,
          cpf: data.cpf,
          phone: data.phone,
          memberId: member!.id,
        }))
        setSelectedPlan(data.plan)
        setPaymentType(data.paymentType)
        localStorage.removeItem(DRAFT_KEY)

        toast.success('Dados salvos! Verifique seu email.', { id: 'reg-progress' })

        // Send verification email (non-blocking)
        sendVerificationEmail().catch(err => {
          logger.error('Erro ao enviar email de verificacao:', err)
          toast.error('Nao foi possivel enviar o email de verificacao. Use o botao "Reenviar" abaixo.', { duration: 6000 })
        })

        completeStep(2)
        setStep(3)
      } else {
        logger.error('All member creation attempts failed:', lastError)
        toast.error('Erro ao criar seu cadastro. Por favor, tente novamente.', {
          id: 'reg-progress',
          duration: 8000,
          description: 'Se o problema persistir, entre em contato com o suporte.',
        })
      }
    } catch (error) {
      logger.error('Error in personal data step:', error)
      toast.error('Erro ao salvar dados. Verifique sua conexao.', { id: 'reg-progress' })
    } finally {
      setLoading(false)
      isSubmittingRef.current = false
    }
  }, [user, memberData.email, sendVerificationEmail])

  const handleEmailVerified = useCallback(() => {
    completeStep(3)
    setStep(4)
  }, [])

  const handleResendVerification = useCallback(async () => {
    const result = await sendVerificationEmail()
    if (result.success) {
      toast.success('Email de verificacao reenviado!')
    } else {
      toast.error(result.error || 'Erro ao reenviar email.')
    }
    return result
  }, [sendVerificationEmail])

  const handleContractSigned = useCallback((_contractData: ContractData) => {
    completeStep(4)
    setStep(5)
    toast.success('Contrato assinado! Finalizando pagamento...')
  }, [])

  const handlePaymentSuccess = useCallback(() => {
    toast.success('Pagamento recebido! Estamos ativando sua conta...', {
      description: 'A confirmacao leva alguns segundos.',
      duration: 5000,
    })
    setTimeout(() => navigate('/membro'), 3000)
  }, [navigate])

  // ─── Loading state while checking existing member ────────────────────────
  if (user && !initialCheckDone) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background py-6 sm:py-8 px-4">
      <motion.div
        className="max-w-lg mx-auto"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header */}
        <div className="text-center mb-6">
          <Link to="/assinar" className="inline-flex items-center text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para planos
          </Link>
          <div className="mb-4">
            <img src="/logo-vip.png" alt="Clube Geek & Toys VIP" className="w-48 sm:w-56 mx-auto" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-heading font-bold text-foreground">
            {step === 1 ? 'Criar Conta' :
             step === 2 ? 'Seus Dados' :
             step === 3 ? 'Verificar Email' :
             step === 4 ? 'Contrato' :
             'Pagamento'}
          </h1>
          <p className="text-muted-foreground mt-2">
            {step <= 2
              ? `Complete seu cadastro para ativar o plano ${plan.name}`
              : step === 3
              ? 'Confirme seu email para continuar'
              : step === 4
              ? 'Leia e assine o contrato de adesao'
              : 'Finalize o pagamento para ativar seus beneficios'}
          </p>
        </div>

        {/* Stepper */}
        <div className="mb-6">
          <RegistrationStepper currentStep={step} completedSteps={completedSteps} />
        </div>

        {/* Plan Summary */}
        <Card className="mb-6 border-primary/20 bg-primary/5">
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

        {/* Draft prompt */}
        {showDraftPrompt && step <= 2 && (
          <Card className="mb-4 border-yellow-500/50 bg-yellow-500/10">
            <CardContent className="p-4">
              <p className="text-sm font-medium mb-2">Encontramos um cadastro em andamento. Deseja continuar?</p>
              <div className="flex gap-2">
                <button
                  className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={loadDraft}
                >
                  Sim, continuar
                </button>
                <button
                  className="px-3 py-1.5 text-sm font-medium rounded-md border border-border hover:bg-muted"
                  onClick={discardDraft}
                >
                  Nao, comecar novo
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step Content */}
        {step === 1 && (
          <StepAccount
            onNext={handleAccountCreated}
            onGoogleSuccess={handleGoogleSuccess}
            loading={loading}
            defaultEmail={memberData.email}
          />
        )}

        {step === 2 && (
          <StepPersonalData
            onNext={handlePersonalDataComplete}
            onBack={() => {
              if (accountAlreadyExists) {
                // Can't go back to account creation if account already exists
                toast.info('Sua conta ja existe. Complete os dados abaixo.')
              } else {
                setStep(1)
              }
            }}
            loading={loading}
            defaultValues={{
              fullName: memberData.fullName,
              cpf: memberData.cpf,
              phone: memberData.phone,
              plan: selectedPlan,
              paymentType,
            }}
          />
        )}

        {step === 3 && (
          <StepEmailVerification
            email={memberData.email}
            onVerified={handleEmailVerified}
            onResend={handleResendVerification}
            onRefreshUser={refreshUser}
            emailVerified={emailVerified}
          />
        )}

        {step === 4 && memberData.memberId && (
          <StepContract
            memberId={memberData.memberId}
            memberName={memberData.fullName}
            memberCPF={memberData.cpf}
            memberEmail={memberData.email}
            memberPhone={memberData.phone}
            plan={selectedPlan}
            paymentType={paymentType}
            onSigned={handleContractSigned}
            onBack={() => setStep(3)}
          />
        )}

        {step === 5 && (
          <StepPayment
            plan={selectedPlan}
            paymentType={paymentType}
            memberId={memberData.memberId}
            memberEmail={memberData.email}
            onSuccess={handlePaymentSuccess}
            onBack={() => setStep(4)}
          />
        )}

        {/* Footer links */}
        <p className="text-center text-muted-foreground mt-8 text-sm">
          Ja tem uma conta? <Link to="/login" className="text-primary hover:underline font-medium">Fazer Login</Link>
        </p>

        <div className="mt-8 flex justify-center gap-4 text-xs text-muted-foreground/60">
          <Link to="/termos" className="hover:text-foreground hover:underline">Termos de Uso</Link>
          <span>•</span>
          <Link to="/privacidade" className="hover:text-foreground hover:underline">Privacidade</Link>
        </div>
      </motion.div>
    </div>
  )
}
