import { useState, useEffect, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { paymentLogger } from '../lib/logger'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Loading } from './ui/loading'
import { CardTokenizationForm, type CardInfo } from './CardTokenizationForm'
import { PLANS, type PlanType, type PaymentType, type PendingPaymentInfo, type SubscriptionFrequencyType } from '../types'
import { formatCurrency } from '../lib/utils'
import {
  generatePixPayment,
  createCardPayment,
  checkPixPaymentStatus,
  isPagBankConfigured,
  type PixPaymentData,
} from '../lib/payments'
import { createSubscription } from '../lib/subscriptions'
import { savePendingPayment, clearPendingPayment } from '../lib/members'
import { toast } from 'sonner'
import {
  X,
  CreditCard,
  QrCode,
  Copy,
  Check,
  Clock,
  AlertCircle,
  RefreshCw,
  Repeat,
  Zap,
  Shield,
  CheckCircle,
  Sparkles,
} from 'lucide-react'

// Payment mode: subscription (recurring) or one-time
type PaymentMode = 'subscription' | 'one-time'

// Payment method within each mode
type PaymentMethodType = 'pix' | 'card' | 'subscription-card'

interface PaymentModalProps {
  plan: PlanType
  paymentType: PaymentType
  memberEmail?: string
  memberId?: string
  initialPendingPayment?: PendingPaymentInfo
  onClose: () => void
  onSuccess: () => void
  // New props for subscription support
  defaultMode?: PaymentMode
  allowModeSwitch?: boolean
}

export function PaymentModal({
  plan,
  paymentType,
  memberEmail = 'cliente@email.com',
  memberId = 'temp_member',
  initialPendingPayment,
  onClose,
  onSuccess,
  defaultMode = 'subscription',
  allowModeSwitch = true,
}: PaymentModalProps) {
  const [mode, setMode] = useState<PaymentMode>(defaultMode)
  const [method, setMethod] = useState<PaymentMethodType | null>(null)
  const [loading, setLoading] = useState(false)
  const [pixData, setPixData] = useState<PixPaymentData | null>(null)
  const [copied, setCopied] = useState(false)
  const [checkingPayment, setCheckingPayment] = useState(false)
  const [timeLeft, setTimeLeft] = useState(30 * 60)
  const [checkingPreviousPayment, setCheckingPreviousPayment] = useState(false)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const planData = PLANS[plan]
  const amount = paymentType === 'monthly' ? planData.priceMonthly : planData.priceAnnual
  const isConfigured = isPagBankConfigured()
  const frequencyType: SubscriptionFrequencyType = paymentType === 'monthly' ? 'months' : 'years'

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // Check for previous pending payment on mount
  useEffect(() => {
    if (initialPendingPayment && isConfigured) {
      checkPreviousPayment(initialPendingPayment)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPendingPayment])

  async function checkPreviousPayment(pendingPayment: PendingPaymentInfo) {
    const expiresAt = new Date(pendingPayment.expiresAt)
    if (expiresAt < new Date()) {
      if (memberId !== 'temp_member') {
        await clearPendingPayment(memberId)
      }
      return
    }

    setCheckingPreviousPayment(true)
    toast.loading('Verificando pagamento anterior...', { id: 'check-prev' })

    const status = await checkPixPaymentStatus(pendingPayment.paymentId)

    if (status === 'paid') {
      toast.success('Pagamento anterior confirmado!', { id: 'check-prev' })
      if (memberId !== 'temp_member') {
        await clearPendingPayment(memberId)
      }
      onSuccess()
    } else if (status === 'failed') {
      toast.error('Pagamento anterior não foi aprovado. Gere um novo.', { id: 'check-prev' })
      if (memberId !== 'temp_member') {
        await clearPendingPayment(memberId)
      }
    } else {
      toast.dismiss('check-prev')
      toast.info('Pagamento ainda pendente. Continue de onde parou.')

      const remaining = Math.floor((expiresAt.getTime() - Date.now()) / 1000)
      setTimeLeft(remaining > 0 ? remaining : 0)

      setPixData({
        paymentId: pendingPayment.paymentId,
        qrCode: pendingPayment.qrCode,
        qrCodeBase64: '',
        pixKey: pendingPayment.qrCode,
        expiresAt: pendingPayment.expiresAt,
        amount: pendingPayment.amount,
      })
      setMethod('pix')
      setMode('one-time')

      startPaymentPolling(pendingPayment.paymentId)
    }

    setCheckingPreviousPayment(false)
  }

  // Expiration timer for PIX - prevents negative values
  useEffect(() => {
    if (pixData && method === 'pix') {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          // Prevent going below 0
          if (prev <= 0) {
            if (timerRef.current) clearInterval(timerRef.current)
            return 0
          }
          if (prev === 1) {
            if (timerRef.current) clearInterval(timerRef.current)
            toast.error('QR Code expirado. Gere um novo.')
            // Stop polling when expired
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
            return 0
          }
          return prev - 1
        })
      }, 1000)

      return () => {
        if (timerRef.current) clearInterval(timerRef.current)
      }
    }
  }, [pixData, method])

  function formatTime(seconds: number): string {
    if (seconds <= 0) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  async function handlePixPayment() {
    setLoading(true)

    try {
      const pix = await generatePixPayment(
        amount,
        `Clube Geek & Toys - Plano ${planData.name}`,
        memberEmail,
        memberId
      )

      if (pix) {
        setPixData(pix)
        setTimeLeft(30 * 60)

        if (memberId !== 'temp_member') {
          const pendingPaymentInfo: PendingPaymentInfo = {
            paymentId: pix.paymentId,
            qrCode: pix.qrCode,
            amount: pix.amount,
            expiresAt: pix.expiresAt,
            createdAt: new Date().toISOString(),
          }
          await savePendingPayment(memberId, pendingPaymentInfo)
          paymentLogger.info('Pending payment saved for member:', memberId)
        }

        if (isConfigured) {
          startPaymentPolling(pix.paymentId)
        }
      } else {
        toast.error('Erro ao gerar QR Code PIX')
      }
    } catch (error) {
      paymentLogger.error('Error generating PIX:', error)
      toast.error('Erro ao gerar pagamento. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  function startPaymentPolling(paymentId: string) {
    // Clear any existing polling
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
    }

    let pollCount = 0
    const MAX_POLL_REQUESTS = 180 // Max 180 requests (15 min at 5s intervals)
    const POLL_INTERVAL = 5000 // 5 seconds

    pollIntervalRef.current = setInterval(async () => {
      pollCount++

      // Stop polling after max requests
      if (pollCount > MAX_POLL_REQUESTS) {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
        toast.warning('Verificação automática pausada. Clique em "Verificar Pagamento" para checar.')
        return
      }

      try {
        const status = await checkPixPaymentStatus(paymentId)

        if (status === 'paid') {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
          if (memberId !== 'temp_member') {
            await clearPendingPayment(memberId)
          }
          toast.success('Pagamento confirmado!')
          onSuccess()
        } else if (status === 'failed') {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
          if (memberId !== 'temp_member') {
            await clearPendingPayment(memberId)
          }
          toast.error('Pagamento não aprovado')
        }
      } catch (error) {
        paymentLogger.warn('Polling error (will retry):', error)
        // Don't stop polling on error, just log it
      }
    }, POLL_INTERVAL)
  }

  async function checkPaymentManually() {
    if (!pixData) return

    setCheckingPayment(true)
    const status = await checkPixPaymentStatus(pixData.paymentId)

    if (status === 'paid') {
      if (memberId !== 'temp_member') {
        await clearPendingPayment(memberId)
      }
      toast.success('Pagamento confirmado!')
      onSuccess()
    } else if (status === 'failed') {
      if (memberId !== 'temp_member') {
        await clearPendingPayment(memberId)
      }
      toast.error('Pagamento não aprovado')
    } else {
      toast.info('Aguardando pagamento...')
    }

    setCheckingPayment(false)
  }

  async function handleCardToken(encryptedCard: string, cardInfo: CardInfo) {
    setLoading(true)

    try {
      const result = await createCardPayment(
        plan,
        paymentType,
        memberEmail,
        cardInfo.cardholderName,
        memberId,
        encryptedCard
      )

      if (result && result.status === 'paid') {
        toast.success('Pagamento aprovado!')
        onSuccess()
      } else if (result) {
        toast.info('Pagamento em processamento...')
        onSuccess()
      } else {
        toast.error('Erro ao processar pagamento com cartão')
      }
    } catch (error) {
      paymentLogger.error('Card payment error:', error)
      toast.error('Erro ao processar pagamento')
    } finally {
      setLoading(false)
    }
  }

  // Handle subscription card token
  async function handleSubscriptionCardToken(token: string, cardInfo: CardInfo) {
    setLoading(true)

    try {
      paymentLogger.info('Creating subscription with card:', cardInfo.brand, '**** ' + cardInfo.lastFourDigits)

      const result = await createSubscription({
        memberId,
        plan,
        frequencyType,
        payerEmail: memberEmail,
        payerName: cardInfo.cardholderName,
        encryptedCard: token,
      })

      if (result) {
        toast.success('Assinatura criada com sucesso!')
        paymentLogger.info('Subscription created:', result.id)
        onSuccess()
      } else {
        toast.error('Erro ao criar assinatura. Tente novamente.')
      }
    } catch (error) {
      paymentLogger.error('Subscription creation error:', error)
      toast.error('Erro ao processar assinatura')
    } finally {
      setLoading(false)
    }
  }

  function handleSelectMethod(selectedMethod: PaymentMethodType) {
    setMethod(selectedMethod)
    if (selectedMethod === 'pix') {
      handlePixPayment()
    } else if (selectedMethod === 'card') {
      // Card form will be shown in the UI — no redirect needed with PagBank
    }
    // subscription-card is handled by CardTokenizationForm
  }

  function copyPixCode() {
    if (pixData) {
      navigator.clipboard.writeText(pixData.qrCode)
      setCopied(true)
      toast.success('Código PIX copiado!')
      setTimeout(() => setCopied(false), 2000)
    }
  }

  async function simulatePaymentConfirmation() {
    const env = import.meta.env.VITE_ENVIRONMENT

    if (env !== 'development') {
      toast.error('Simulação não disponível em produção')
      paymentLogger.error('Payment simulation blocked: Not in development mode')
      return
    }

    setLoading(true)

    if (memberId !== 'temp_member') {
      await clearPendingPayment(memberId)
    }

    setTimeout(() => {
      toast.success('Pagamento confirmado (SIMULAÇÃO)')
      onSuccess()
    }, 1500)
  }

  const isSimulationAllowed = import.meta.env.VITE_ENVIRONMENT === 'development'

  // Get plan-specific gradient colors
  const getPlanGradient = () => {
    switch (plan) {
      case 'black':
        return 'from-zinc-800 to-zinc-900'
      case 'gold':
        return 'from-yellow-600 to-amber-700'
      case 'silver':
      default:
        return 'from-slate-400 to-slate-500'
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 bg-black/70" onClick={onClose}>
      <Card
        className="w-full max-w-md h-[95vh] sm:h-auto sm:max-h-[90vh] overflow-y-auto overflow-x-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Plan Header Banner */}
        <div className={`bg-gradient-to-r ${getPlanGradient()} p-5 text-white relative`}>
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-white/70 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
              <span className="text-2xl">{planData.icon}</span>
            </div>
            <div>
              <h2 className="font-bold text-xl">Plano {planData.name}</h2>
              <p className="text-white/80 text-sm">
                {paymentType === 'monthly' ? 'Mensal' : 'Anual'} • {formatCurrency(amount)}
              </p>
            </div>
          </div>
        </div>

        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5 text-green-500" />
            Pagamento Seguro
          </CardTitle>
          <CardDescription>
            Seus dados são protegidos e criptografados
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Checking previous payment */}
          {checkingPreviousPayment && (
            <div className="py-8 text-center">
              <Loading size="lg" text="Verificando pagamento anterior..." />
            </div>
          )}

          {!checkingPreviousPayment && (
            <>
              {/* Mode selector */}
              {!method && allowModeSwitch && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-center">Escolha o tipo de pagamento:</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setMode('subscription')}
                      className={`
                        relative p-4 rounded-xl border-2 transition-all text-left
                        ${mode === 'subscription'
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                          : 'border-border hover:border-primary/50 hover:bg-muted/50'
                        }
                      `}
                    >
                      {mode === 'subscription' && (
                        <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                          <Check className="h-4 w-4 text-primary-foreground" />
                        </div>
                      )}
                      <Repeat className={`h-6 w-6 mb-2 ${mode === 'subscription' ? 'text-primary' : 'text-muted-foreground'}`} />
                      <p className="font-semibold text-sm">Assinatura</p>
                      <p className="text-xs text-muted-foreground">Renovação automática</p>
                      <Badge variant="success" className="mt-2 text-[10px]">Recomendado</Badge>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('one-time')}
                      className={`
                        relative p-4 rounded-xl border-2 transition-all text-left
                        ${mode === 'one-time'
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                          : 'border-border hover:border-primary/50 hover:bg-muted/50'
                        }
                      `}
                    >
                      {mode === 'one-time' && (
                        <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                          <Check className="h-4 w-4 text-primary-foreground" />
                        </div>
                      )}
                      <Zap className={`h-6 w-6 mb-2 ${mode === 'one-time' ? 'text-primary' : 'text-muted-foreground'}`} />
                      <p className="font-semibold text-sm">Avulso</p>
                      <p className="text-xs text-muted-foreground">Renovação manual</p>
                    </button>
                  </div>
                </div>
              )}

              {/* Subscription info */}
              {!method && mode === 'subscription' && (
                <div className="p-4 bg-gradient-to-br from-green-500/10 to-emerald-500/5 border border-green-500/20 rounded-xl space-y-3">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-green-500" />
                    Benefícios da Assinatura
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                      <span>Cobrança automática</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                      <span>Cancele quando quiser</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                      <span>Sem taxas ocultas</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                      <span>Pause facilmente</span>
                    </div>
                  </div>
                </div>
              )}

              {/* One-time info */}
              {!method && mode === 'one-time' && (
                <div className="p-4 bg-muted/50 border border-border rounded-xl space-y-3">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <Zap className="h-4 w-4 text-yellow-500" />
                    Pagamento Avulso
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <QrCode className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                      <span>Pague via PIX (instantâneo) ou cartão</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />
                      <span>Renove manualmente quando expirar</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Shield className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                      <span>Controle total sobre cobranças</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Simulation mode warning */}
              {!isConfigured && !method && (
                <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-yellow-600 dark:text-yellow-400">
                      Modo de Teste
                    </p>
                    <p className="text-yellow-600/80 dark:text-yellow-400/80">
                      O pagamento está em modo simulação.
                    </p>
                  </div>
                </div>
              )}

              {/* Method selection - Subscription mode */}
              {!method && mode === 'subscription' && (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() => setMethod('subscription-card')}
                    className="w-full p-5 rounded-xl border-2 border-primary bg-primary/5 hover:bg-primary/10 transition-all flex items-center gap-4 text-left"
                  >
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
                      <CreditCard className="h-7 w-7 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-base">Cartão de Crédito</p>
                      <p className="text-sm text-muted-foreground">
                        Cobrança automática {paymentType === 'monthly' ? 'mensal' : 'anual'}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs bg-green-500/20 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full">
                          Visa
                        </span>
                        <span className="text-xs bg-orange-500/20 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-full">
                          Mastercard
                        </span>
                        <span className="text-xs bg-blue-500/20 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full">
                          Elo
                        </span>
                      </div>
                    </div>
                  </button>
                  <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    PIX não está disponível para assinaturas recorrentes
                  </p>
                </div>
              )}

              {/* Method selection - One-time mode */}
              {!method && mode === 'one-time' && (
                <div className="space-y-4">
                  <p className="text-sm font-medium text-center">Escolha a forma de pagamento:</p>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => handleSelectMethod('pix')}
                      className="p-4 rounded-xl border-2 border-border hover:border-green-500 hover:bg-green-500/5 transition-all flex flex-col items-center gap-3"
                    >
                      <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg">
                        <QrCode className="h-7 w-7 text-white" />
                      </div>
                      <div className="text-center">
                        <p className="font-bold">PIX</p>
                        <p className="text-xs text-muted-foreground">Aprovação imediata</p>
                      </div>
                      <Badge variant="success" className="text-[10px]">Recomendado</Badge>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectMethod('card')}
                      disabled={!isConfigured}
                      className="p-4 rounded-xl border-2 border-border hover:border-blue-500 hover:bg-blue-500/5 transition-all flex flex-col items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className={`w-14 h-14 rounded-xl flex items-center justify-center shadow-lg ${isConfigured ? 'bg-gradient-to-br from-blue-500 to-blue-600' : 'bg-muted'}`}>
                        <CreditCard className={`h-7 w-7 ${isConfigured ? 'text-white' : 'text-muted-foreground'}`} />
                      </div>
                      <div className="text-center">
                        <p className="font-bold">Cartão</p>
                        <p className="text-xs text-muted-foreground">
                          {isConfigured ? 'Crédito ou débito' : 'Indisponível'}
                        </p>
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Subscription Card Form */}
              {method === 'subscription-card' && (
                <div className="space-y-4">
                  <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                    <p className="text-sm text-center">
                      Valor: <strong>{formatCurrency(amount)}</strong>/{paymentType === 'monthly' ? 'mês' : 'ano'}
                    </p>
                    <p className="text-xs text-center text-muted-foreground mt-1">
                      Primeira cobrança imediatamente após confirmação
                    </p>
                  </div>

                  <CardTokenizationForm
                    amount={amount}
                    onTokenGenerated={handleSubscriptionCardToken}
                    onCancel={() => setMethod(null)}
                    disabled={loading}
                  />

                  {loading && (
                    <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
                      <Loading size="lg" text="Criando assinatura..." />
                    </div>
                  )}
                </div>
              )}

              {/* PIX Payment */}
              {method === 'pix' && (
                <div className="space-y-5">
                  {loading ? (
                    <div className="py-12">
                      <Loading size="lg" text="Gerando QR Code PIX..." />
                    </div>
                  ) : pixData ? (
                    <>
                      {/* Timer and Amount Banner */}
                      <div className="p-4 bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-xl">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${timeLeft < 300 ? 'bg-red-500/20' : 'bg-green-500/20'}`}>
                              <Clock className={`h-5 w-5 ${timeLeft < 300 ? 'text-red-500' : 'text-green-500'}`} />
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Expira em</p>
                              <p className={`font-bold ${timeLeft < 300 ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
                                {formatTime(timeLeft)}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Total</p>
                            <p className="font-bold text-lg text-green-600 dark:text-green-400">
                              {formatCurrency(amount)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* QR Code */}
                      <div className="flex justify-center">
                        <div className="relative">
                          <div className="bg-white p-5 rounded-2xl shadow-xl border-4 border-green-500/20">
                            <QRCodeSVG
                              value={pixData.qrCode}
                              size={180}
                              level="H"
                              includeMargin
                            />
                          </div>
                          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                            Escaneie com seu banco
                          </div>
                        </div>
                      </div>

                      {/* Instructions */}
                      <div className="grid grid-cols-3 gap-2 text-center pt-4">
                        <div className="space-y-1">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold mx-auto">1</div>
                          <p className="text-xs text-muted-foreground">Abra seu app de banco</p>
                        </div>
                        <div className="space-y-1">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold mx-auto">2</div>
                          <p className="text-xs text-muted-foreground">Escaneie o QR Code</p>
                        </div>
                        <div className="space-y-1">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold mx-auto">3</div>
                          <p className="text-xs text-muted-foreground">Confirme o pagamento</p>
                        </div>
                      </div>

                      {/* Copy code */}
                      <div className="space-y-2">
                        <p className="text-sm font-medium flex items-center gap-2">
                          <Copy className="h-4 w-4 text-muted-foreground" />
                          PIX Copia e Cola
                        </p>
                        <div className="flex gap-2">
                          <div className="flex-1 p-3 bg-muted rounded-lg text-xs font-mono overflow-hidden border">
                            <span className="truncate block">{pixData.qrCode.substring(0, 35)}...</span>
                          </div>
                          <Button
                            variant={copied ? 'default' : 'outline'}
                            size="icon"
                            onClick={copyPixCode}
                            className={copied ? 'bg-green-500 hover:bg-green-600' : ''}
                          >
                            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>

                      {/* Check payment / Simulate */}
                      <div className="pt-4 border-t space-y-2">
                        {isConfigured ? (
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={checkPaymentManually}
                            disabled={checkingPayment}
                          >
                            {checkingPayment ? (
                              <Loading size="sm" />
                            ) : (
                              <>
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Verificar Pagamento
                              </>
                            )}
                          </Button>
                        ) : isSimulationAllowed ? (
                          <>
                            <Button
                              className="w-full"
                              onClick={simulatePaymentConfirmation}
                              disabled={loading}
                            >
                              {loading ? <Loading size="sm" /> : 'Confirmar Pagamento (Teste)'}
                            </Button>
                            <p className="text-xs text-center text-muted-foreground">
                              Modo desenvolvimento - Em produção, configure VITE_PAYMENT_API_URL
                            </p>
                          </>
                        ) : (
                          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-center">
                            <AlertCircle className="h-6 w-6 mx-auto text-red-500 mb-2" />
                            <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                              Pagamento não configurado
                            </p>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <AlertCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
                      <p className="text-muted-foreground mb-4">
                        Erro ao gerar QR Code. Tente novamente.
                      </p>
                      <Button onClick={handlePixPayment}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Tentar Novamente
                      </Button>
                    </div>
                  )}

                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => {
                      setMethod(null)
                      setPixData(null)
                      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
                    }}
                  >
                    Voltar
                  </Button>
                </div>
              )}

              {/* Card (direct payment via PagBank) */}
              {method === 'card' && (
                <div>
                  <CardTokenizationForm
                    amount={amount}
                    onTokenGenerated={handleCardToken}
                    onCancel={() => setMethod(null)}
                    disabled={loading}
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
