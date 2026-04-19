/**
 * PaymentModal — Card via Stripe, PIX via QR code local.
 *
 * Card flow: backend creates Stripe PaymentIntent → frontend uses Stripe Elements.
 * PIX flow: backend generates EMV QR code → frontend displays it → admin confirms manually.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
// paymentLogger available for debugging
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Loading } from './ui/loading'
import { StripePaymentForm } from './StripePaymentForm'
import { generatePixPayment, checkPaymentStatus, type PixPaymentData } from '../lib/payments'
import { PLANS, type PlanType, type PaymentType, type PendingPaymentInfo } from '../types'
import { formatCurrency } from '../lib/utils'
import { savePendingPayment, clearPendingPayment } from '../lib/members'
import { api } from '../lib/api-client'
import { toast } from 'sonner'
import {
  X,
  CreditCard,
  QrCode,
  Copy,
  Check,
  Clock,
  Repeat,
  Zap,
  Shield,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'

type PaymentMode = 'subscription' | 'one-time'
type PaymentMethod = 'card' | 'pix' | null

interface PaymentModalProps {
  plan: PlanType
  paymentType: PaymentType
  memberEmail?: string
  memberId?: string
  memberName?: string
  initialPendingPayment?: PendingPaymentInfo
  onClose: () => void
  onSuccess: () => void
  defaultMode?: PaymentMode
  allowModeSwitch?: boolean
}

export function PaymentModal({
  plan,
  paymentType,
  memberEmail = 'cliente@email.com',
  memberId = 'temp_member',
  memberName = 'Membro',
  initialPendingPayment,
  onClose,
  onSuccess,
  defaultMode = 'one-time',
  allowModeSwitch = true,
}: PaymentModalProps) {
  const [mode, setMode] = useState<PaymentMode>(defaultMode)
  const [method, setMethod] = useState<PaymentMethod>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [pixData, setPixData] = useState<PixPaymentData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [timeLeft, setTimeLeft] = useState(30 * 60)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const planData = PLANS[plan]
  const amount = paymentType === 'monthly' ? planData.priceMonthly : planData.priceAnnual

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // Check previous pending payment
  useEffect(() => {
    if (initialPendingPayment) {
      const expiresAt = new Date(initialPendingPayment.expiresAt)
      if (expiresAt > new Date() && initialPendingPayment.qrCode) {
        setPixData({
          paymentIntentId: initialPendingPayment.paymentId,
          clientSecret: '',
          qrCode: initialPendingPayment.qrCode,
          qrCodeBase64: '',
          qrCodeImageUrl: '',
          pixKey: '',
          expiresAt: initialPendingPayment.expiresAt,
          amount: initialPendingPayment.amount,
        })
        setMethod('pix')
        startPixTimer(Math.floor((expiresAt.getTime() - Date.now()) / 1000))
        startPixPolling(initialPendingPayment.paymentId)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPendingPayment])

  function startPixTimer(seconds: number) {
    setTimeLeft(seconds)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          if (pollRef.current) clearInterval(pollRef.current)
          toast.error('QR Code expirado. Gere um novo.')
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  function startPixPolling(paymentId: string) {
    if (pollRef.current) clearInterval(pollRef.current)
    let count = 0
    pollRef.current = setInterval(async () => {
      count++
      if (count > 180) {
        if (pollRef.current) clearInterval(pollRef.current)
        return
      }
      try {
        const status = await checkPaymentStatus(paymentId)
        if (status === 'paid') {
          if (pollRef.current) clearInterval(pollRef.current)
          if (timerRef.current) clearInterval(timerRef.current)
          toast.success('Pagamento confirmado!')
          onSuccess()
        }
      } catch { /* retry silently */ }
    }, 5000)
  }

  function formatTime(s: number): string {
    if (s <= 0) return '0:00'
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
  }

  async function handleCopyCode() {
    if (!pixData?.qrCode) return
    try {
      await navigator.clipboard.writeText(pixData.qrCode)
      setCopied(true)
      toast.success('Código PIX copiado!')
      setTimeout(() => setCopied(false), 3000)
    } catch {
      toast.error('Não foi possível copiar')
    }
  }

  // ─── PIX Flow ──────────────────────────────────────────────────────────────

  const handlePixPayment = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const pix = await generatePixPayment(
        amount,
        `Clube Geek & Toys - Plano ${planData.name}`,
        memberEmail,
        memberId
      )
      if (pix) {
        setPixData(pix)
        setMethod('pix')
        startPixTimer(30 * 60)
        startPixPolling(pix.paymentIntentId)

        if (memberId !== 'temp_member') {
          await savePendingPayment(memberId, {
            paymentId: pix.paymentIntentId,
            qrCode: pix.qrCode,
            amount: pix.amount,
            expiresAt: pix.expiresAt,
            createdAt: new Date().toISOString(),
          })
        }
      } else {
        setError('Erro ao gerar QR Code PIX')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao gerar PIX'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, planData.name, memberEmail, memberId])

  // ─── Card Flow (Stripe) ────────────────────────────────────────────────────

  const handleCardPayment = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let cs: string | undefined

      if (mode === 'subscription') {
        const res = await api.post<{ clientSecret: string; id: string }>('/subscription/create', {
          member_id: memberId,
          plan,
          frequency_type: paymentType === 'monthly' ? 'months' : 'years',
          payer_email: memberEmail,
          payer_name: memberName,
          transaction_amount: amount,
        })
        if (res.error) throw new Error(res.error)
        cs = (res.data as { clientSecret?: string })?.clientSecret
      } else {
        const res = await api.post<{ clientSecret: string; paymentIntentId: string }>('/checkout/card/create', {
          amount,
          description: `Clube Geek & Toys - Plano ${planData.name}`,
          payer_email: memberEmail,
          payer_name: memberName,
          external_reference: memberId,
        })
        if (res.error) throw new Error(res.error)
        cs = (res.data as { clientSecret?: string })?.clientSecret
      }

      if (!cs) throw new Error('Não foi possível inicializar o pagamento.')
      setClientSecret(cs)
      setMethod('card')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao iniciar pagamento.'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [mode, memberId, plan, paymentType, amount, memberEmail, planData.name])

  function handlePaymentSuccess() {
    if (memberId !== 'temp_member') clearPendingPayment(memberId).catch(() => {})
    if (pollRef.current) clearInterval(pollRef.current)
    if (timerRef.current) clearInterval(timerRef.current)
    onSuccess()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <Card className="w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="relative">
          <button onClick={onClose} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Pagamento
          </CardTitle>
          <CardDescription>
            Plano {planData.name} — {formatCurrency(amount)}{paymentType === 'monthly' ? '/mês' : '/ano'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Mode switch */}
          {allowModeSwitch && !method && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMode('one-time')}
                className={`p-3 rounded-lg border-2 text-center transition-all ${mode === 'one-time' ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}
              >
                <Zap className="h-5 w-5 mx-auto mb-1 text-primary" />
                <p className="text-sm font-medium">Pagamento Único</p>
                <p className="text-xs text-muted-foreground">PIX ou Cartão</p>
              </button>
              <button
                onClick={() => setMode('subscription')}
                className={`p-3 rounded-lg border-2 text-center transition-all ${mode === 'subscription' ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}
              >
                <Repeat className="h-5 w-5 mx-auto mb-1 text-primary" />
                <p className="text-sm font-medium">Assinatura</p>
                <p className="text-xs text-muted-foreground">Cobrança recorrente</p>
              </button>
            </div>
          )}

          {/* Plan summary */}
          <div className="p-4 rounded-lg bg-muted/50 flex items-center justify-between">
            <div>
              <p className="font-medium">{planData.name}</p>
              <p className="text-sm text-muted-foreground">
                {mode === 'subscription' ? 'Recorrente' : 'Pagamento único'} · {paymentType === 'monthly' ? 'Mensal' : 'Anual'}
              </p>
            </div>
            <Badge variant="default" className="text-lg px-3 py-1">{formatCurrency(amount)}</Badge>
          </div>

          {/* Error */}
          {error && !method && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-center space-y-3">
              <AlertCircle className="h-8 w-8 mx-auto text-red-500" />
              <p className="text-sm text-red-500">{error}</p>
              <Button variant="outline" size="sm" onClick={() => setError(null)}>
                <RefreshCw className="h-4 w-4 mr-2" />Tentar novamente
              </Button>
            </div>
          )}

          {/* Method selection (only for one-time) */}
          {!method && !error && mode === 'one-time' && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-center text-muted-foreground">Escolha o método de pagamento:</p>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" size="lg" onClick={handlePixPayment} disabled={loading} className="h-auto py-4 flex-col gap-2">
                  <QrCode className="h-6 w-6 text-green-500" />
                  <span>PIX</span>
                  <span className="text-xs text-muted-foreground">QR Code na hora</span>
                </Button>
                <Button variant="outline" size="lg" onClick={handleCardPayment} disabled={loading} className="h-auto py-4 flex-col gap-2">
                  <CreditCard className="h-6 w-6 text-blue-500" />
                  <span>Cartão</span>
                  <span className="text-xs text-muted-foreground">Crédito</span>
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center">PIX: ativação após nossa equipe confirmar o recebimento (geralmente em minutos)</p>
              {loading && <div className="flex justify-center"><Loading size="lg" /></div>}
            </div>
          )}

          {/* Subscription goes straight to card */}
          {!method && !error && mode === 'subscription' && (
            <Button onClick={handleCardPayment} disabled={loading} className="w-full" size="lg">
              {loading ? <Loading size="sm" /> : <><CreditCard className="h-4 w-4 mr-2" />Iniciar Assinatura com Cartão</>}
            </Button>
          )}

          {/* ═══ PIX: Show QR Code ═══ */}
          {method === 'pix' && pixData && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-500/10 rounded-full text-sm text-green-600 mb-4">
                  <Clock className="h-4 w-4" />
                  Expira em {formatTime(timeLeft)}
                </div>
              </div>

              {/* QR Code */}
              <div className="flex justify-center">
                <div className="p-4 bg-white rounded-xl">
                  <QRCodeSVG value={pixData.qrCode} size={200} level="M" />
                </div>
              </div>

              {/* Copy code */}
              <div className="space-y-2">
                <p className="text-xs text-center text-muted-foreground">Ou copie o código PIX:</p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={pixData.qrCode}
                    className="flex-1 text-xs bg-muted rounded px-3 py-2 font-mono truncate"
                  />
                  <Button variant="outline" size="sm" onClick={handleCopyCode}>
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Instructions */}
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <p className="text-sm font-medium">Como pagar:</p>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal pl-4">
                  <li>Abra o app do seu banco</li>
                  <li>Escolha pagar com PIX (QR Code ou Copia e Cola)</li>
                  <li>Escaneie o QR ou cole o código acima</li>
                  <li>Confirme o pagamento de <strong>{formatCurrency(amount)}</strong></li>
                  <li>Aguarde a confirmação (nossa equipe verifica e ativa sua conta)</li>
                </ol>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Shield className="h-4 w-4 text-green-500" />
                <span>Após o pagamento, nossa equipe será notificada e ativará sua conta.</span>
              </div>

              <Button variant="ghost" onClick={() => { setMethod(null); setPixData(null) }} className="w-full">
                Escolher outro método
              </Button>
            </div>
          )}

          {/* ═══ Card: Stripe Elements ═══ */}
          {method === 'card' && clientSecret && (
            <StripePaymentForm
              clientSecret={clientSecret}
              onSuccess={handlePaymentSuccess}
              onError={(msg) => setError(msg)}
              onCancel={() => { setMethod(null); setClientSecret(null); setError(null) }}
              amount={amount}
              submitLabel={mode === 'subscription'
                ? `Assinar por ${formatCurrency(amount)}/${paymentType === 'monthly' ? 'mês' : 'ano'}`
                : undefined
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
