import { useState, useEffect, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Loading } from './ui/loading'
import { PLANS, type PlanType, type PaymentType } from '../types'
import { formatCurrency } from '../lib/utils'
import {
  generatePixPayment,
  createCheckoutPreference,
  checkPixPaymentStatus,
  isMercadoPagoConfigured,
  type PixPaymentData,
} from '../lib/payments'
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
} from 'lucide-react'

interface PaymentModalProps {
  plan: PlanType
  paymentType: PaymentType
  memberEmail?: string
  memberId?: string
  onClose: () => void
  onSuccess: () => void
}

type PaymentMethodType = 'pix' | 'card'

export function PaymentModal({
  plan,
  paymentType,
  memberEmail = 'cliente@email.com',
  memberId = 'temp_member',
  onClose,
  onSuccess,
}: PaymentModalProps) {
  const [method, setMethod] = useState<PaymentMethodType | null>(null)
  const [loading, setLoading] = useState(false)
  const [pixData, setPixData] = useState<PixPaymentData | null>(null)
  const [copied, setCopied] = useState(false)
  const [checkingPayment, setCheckingPayment] = useState(false)
  const [timeLeft, setTimeLeft] = useState(30 * 60) // 30 minutes in seconds
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const planData = PLANS[plan]
  const amount = paymentType === 'monthly' ? planData.priceMonthly : planData.priceAnnual
  const isConfigured = isMercadoPagoConfigured()

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  // Expiration timer
  useEffect(() => {
    if (pixData && method === 'pix') {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current)
            toast.error('QR Code expirado. Gere um novo.')
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

  /**
   * Format remaining time as MM:SS
   */
  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  /**
   * Generate PIX payment
   */
  async function handlePixPayment() {
    setLoading(true)

    const pix = await generatePixPayment(
      amount,
      `Clube Geek & Toys - Plano ${planData.name}`,
      memberEmail,
      memberId
    )

    if (pix) {
      setPixData(pix)
      setTimeLeft(30 * 60)

      // Start polling if API is configured
      if (isConfigured) {
        startPaymentPolling(pix.paymentId)
      }
    } else {
      toast.error('Erro ao gerar QR Code PIX')
    }

    setLoading(false)
  }

  /**
   * Poll for payment status
   */
  function startPaymentPolling(paymentId: string) {
    pollIntervalRef.current = setInterval(async () => {
      const status = await checkPixPaymentStatus(paymentId)

      if (status === 'paid') {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
        toast.success('Pagamento confirmado!')
        onSuccess()
      } else if (status === 'failed') {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
        toast.error('Pagamento não aprovado')
      }
    }, 5000) // Check every 5 seconds
  }

  /**
   * Manual payment check
   */
  async function checkPaymentManually() {
    if (!pixData) return

    setCheckingPayment(true)
    const status = await checkPixPaymentStatus(pixData.paymentId)

    if (status === 'paid') {
      toast.success('Pagamento confirmado!')
      onSuccess()
    } else if (status === 'failed') {
      toast.error('Pagamento não aprovado')
    } else {
      toast.info('Aguardando pagamento...')
    }

    setCheckingPayment(false)
  }

  /**
   * Handle card checkout
   */
  async function handleCardPayment() {
    setLoading(true)

    const preference = await createCheckoutPreference(
      plan,
      paymentType,
      memberEmail,
      memberId
    )

    if (preference) {
      // Redirect to Mercado Pago checkout
      window.location.href = preference.initPoint
    } else {
      toast.error('Erro ao iniciar pagamento com cartão')
      setLoading(false)
    }
  }

  /**
   * Handle payment method selection
   */
  function handleSelectMethod(selectedMethod: PaymentMethodType) {
    setMethod(selectedMethod)
    if (selectedMethod === 'pix') {
      handlePixPayment()
    } else if (selectedMethod === 'card') {
      handleCardPayment()
    }
  }

  /**
   * Copy PIX code to clipboard
   */
  function copyPixCode() {
    if (pixData) {
      navigator.clipboard.writeText(pixData.qrCode)
      setCopied(true)
      toast.success('Código PIX copiado!')
      setTimeout(() => setCopied(false), 2000)
    }
  }

  /**
   * Simulate payment confirmation (for testing)
   */
  function simulatePaymentConfirmation() {
    setLoading(true)
    setTimeout(() => {
      toast.success('Pagamento confirmado!')
      onSuccess()
    }, 1500)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <Card
        className="w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="relative">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
          <CardTitle>Finalizar Pagamento</CardTitle>
          <CardDescription>
            Plano {planData.name} - {paymentType === 'monthly' ? 'Mensal' : 'Anual'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Summary */}
          <div className="p-4 bg-muted rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Plano</span>
              <Badge variant={plan as 'silver' | 'gold' | 'black'}>
                {planData.icon} {planData.name}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-2xl font-bold">{formatCurrency(amount)}</span>
            </div>
          </div>

          {/* Simulation mode warning */}
          {!isConfigured && !method && (
            <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-yellow-600 dark:text-yellow-400">
                  Modo de Teste
                </p>
                <p className="text-yellow-600/80 dark:text-yellow-400/80">
                  O pagamento está em modo simulação. Configure as variáveis VITE_PAYMENT_API_URL e VITE_MERCADOPAGO_PUBLIC_KEY para usar pagamentos reais.
                </p>
              </div>
            </div>
          )}

          {/* Method selection */}
          {!method && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Escolha a forma de pagamento:</p>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="h-28 flex-col gap-2 hover:border-green-500 hover:bg-green-500/5"
                  onClick={() => handleSelectMethod('pix')}
                >
                  <QrCode className="h-8 w-8 text-green-500" />
                  <span className="font-semibold">PIX</span>
                  <span className="text-xs text-muted-foreground">Aprovação imediata</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-28 flex-col gap-2 hover:border-blue-500 hover:bg-blue-500/5"
                  onClick={() => handleSelectMethod('card')}
                  disabled={!isConfigured}
                >
                  <CreditCard className="h-8 w-8 text-blue-500" />
                  <span className="font-semibold">Cartão</span>
                  <span className="text-xs text-muted-foreground">
                    {isConfigured ? 'Crédito ou débito' : 'Indisponível'}
                  </span>
                </Button>
              </div>
            </div>
          )}

          {/* PIX Payment */}
          {method === 'pix' && (
            <div className="space-y-4">
              {loading ? (
                <div className="py-8">
                  <Loading size="lg" text="Gerando QR Code PIX..." />
                </div>
              ) : pixData ? (
                <>
                  {/* Timer */}
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className={timeLeft < 300 ? 'text-red-500 font-medium' : 'text-muted-foreground'}>
                      Expira em {formatTime(timeLeft)}
                    </span>
                  </div>

                  {/* QR Code */}
                  <div className="flex justify-center">
                    <div className="bg-white p-4 rounded-xl shadow-lg">
                      <QRCodeSVG
                        value={pixData.qrCode}
                        size={200}
                        level="H"
                        includeMargin
                      />
                    </div>
                  </div>

                  {/* Instructions */}
                  <div className="space-y-2 text-sm">
                    <div className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                        1
                      </div>
                      <span>Abra o app do seu banco</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                        2
                      </div>
                      <span>Escolha pagar com PIX e escaneie o QR Code</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                        3
                      </div>
                      <span>Confirme as informações e finalize o pagamento</span>
                    </div>
                  </div>

                  {/* Copy code */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium">PIX Copia e Cola:</p>
                    <div className="flex gap-2">
                      <div className="flex-1 p-2 bg-muted rounded text-xs font-mono overflow-hidden">
                        <span className="truncate block">{pixData.qrCode.substring(0, 40)}...</span>
                      </div>
                      <Button variant="outline" size="icon" onClick={copyPixCode}>
                        {copied ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
                    <p className="text-sm text-green-700 dark:text-green-300">
                      Valor: <strong>{formatCurrency(amount)}</strong>
                    </p>
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
                    ) : (
                      <>
                        <Button
                          className="w-full"
                          onClick={simulatePaymentConfirmation}
                          disabled={loading}
                        >
                          {loading ? <Loading size="sm" /> : 'Confirmar Pagamento (Teste)'}
                        </Button>
                        <p className="text-xs text-center text-muted-foreground">
                          Em produção, o pagamento será confirmado automaticamente
                        </p>
                      </>
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

          {/* Card (loading while redirecting) */}
          {method === 'card' && (
            <div className="py-8 text-center">
              <Loading size="lg" text="Redirecionando para pagamento..." />
              <p className="text-sm text-muted-foreground mt-4">
                Você será redirecionado para o checkout seguro
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
