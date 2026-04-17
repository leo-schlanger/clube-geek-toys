/**
 * StepPayment — Step 5 of the registration flow (inline, not modal).
 *
 * Card flow: backend creates Stripe PaymentIntent -> frontend uses Stripe Elements.
 * PIX flow: backend generates EMV QR code -> frontend displays it -> admin confirms manually.
 * Subscription flow: goes straight to card (no PIX option).
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import {
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
  ArrowLeft,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'
import { Badge } from '../ui/badge'
import { StripePaymentForm } from '../StripePaymentForm'
import { generatePixPayment, checkPaymentStatus, type PixPaymentData } from '../../lib/payments'
import { PLANS, type PlanType, type PaymentType } from '../../types'
import { formatCurrency } from '../../lib/utils'
import { savePendingPayment, clearPendingPayment } from '../../lib/members'
import { api } from '../../lib/api-client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PaymentMode = 'subscription' | 'one-time'
type PaymentMethodChoice = 'card' | 'pix' | null

interface StepPaymentProps {
  plan: PlanType
  paymentType: PaymentType
  memberId: string
  memberEmail: string
  onSuccess: () => void
  onBack: () => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PIX_TIMEOUT_SECONDS = 30 * 60
const POLL_INTERVAL_MS = 5_000
const MAX_POLL_COUNT = 180

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StepPayment({
  plan,
  paymentType,
  memberId,
  memberEmail,
  onSuccess,
  onBack,
}: StepPaymentProps) {
  const [mode, setMode] = useState<PaymentMode>('one-time')
  const [method, setMethod] = useState<PaymentMethodChoice>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [pixData, setPixData] = useState<PixPaymentData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [timeLeft, setTimeLeft] = useState(PIX_TIMEOUT_SECONDS)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const planData = PLANS[plan]
  const amount = paymentType === 'monthly' ? planData.priceMonthly : planData.priceAnnual

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // ─── Timer & Polling helpers ───────────────────────────────────────────────

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
      if (count > MAX_POLL_COUNT) {
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
      } catch {
        /* retry silently */
      }
    }, POLL_INTERVAL_MS)
  }

  function formatTime(s: number): string {
    if (s <= 0) return '0:00'
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
  }

  // ─── Copy PIX code ─────────────────────────────────────────────────────────

  async function handleCopyCode() {
    if (!pixData?.qrCode) return
    try {
      await navigator.clipboard.writeText(pixData.qrCode)
      setCopied(true)
      toast.success('Codigo PIX copiado!')
      setTimeout(() => setCopied(false), 3000)
    } catch {
      toast.error('Nao foi possivel copiar')
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
        memberId,
      )
      if (pix) {
        setPixData(pix)
        setMethod('pix')
        startPixTimer(PIX_TIMEOUT_SECONDS)
        startPixPolling(pix.paymentIntentId)

        await savePendingPayment(memberId, {
          paymentId: pix.paymentIntentId,
          qrCode: pix.qrCode,
          amount: pix.amount,
          expiresAt: pix.expiresAt,
          createdAt: new Date().toISOString(),
        })
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
          payer_name: 'Membro',
          transaction_amount: amount,
        })
        if (res.error) throw new Error(res.error)
        cs = (res.data as { clientSecret?: string })?.clientSecret
      } else {
        const res = await api.post<{ clientSecret: string; paymentIntentId: string }>('/checkout/card/create', {
          amount,
          description: `Clube Geek & Toys - Plano ${planData.name}`,
          payer_email: memberEmail,
          payer_name: 'Membro',
          external_reference: memberId,
        })
        if (res.error) throw new Error(res.error)
        cs = (res.data as { clientSecret?: string })?.clientSecret
      }

      if (!cs) throw new Error('Nao foi possivel inicializar o pagamento.')
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

  // ─── Success handler ───────────────────────────────────────────────────────

  function handlePaymentSuccess() {
    clearPendingPayment(memberId).catch(() => {})
    if (pollRef.current) clearInterval(pollRef.current)
    if (timerRef.current) clearInterval(timerRef.current)
    onSuccess()
  }

  // ─── Reset method ──────────────────────────────────────────────────────────

  function resetMethod() {
    if (pollRef.current) clearInterval(pollRef.current)
    if (timerRef.current) clearInterval(timerRef.current)
    setMethod(null)
    setPixData(null)
    setClientSecret(null)
    setError(null)
  }

  // ─── Progress bar ratio ────────────────────────────────────────────────────

  const timerProgress = timeLeft / PIX_TIMEOUT_SECONDS

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-6"
    >
      {/* ── Order summary ───────────────────────────────────────────────────── */}
      <Card className="border-primary/20">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="font-semibold text-lg">{planData.name}</p>
                <Badge variant="outline">{planData.name}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {paymentType === 'monthly' ? 'Mensal' : 'Anual'}
              </p>
            </div>
            <p className="text-2xl font-bold">{formatCurrency(amount)}</p>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Pagamento seguro via Stripe
          </p>
        </CardContent>
      </Card>

      {/* ── Payment mode toggle (only when no method selected yet) ──────── */}
      {!method && (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setMode('one-time')}
            className={`p-4 rounded-lg border-2 text-center transition-all ${
              mode === 'one-time'
                ? 'border-primary bg-primary/10'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <Zap className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className="text-sm font-medium">Pagamento Unico</p>
            <p className="text-xs text-muted-foreground">PIX ou Cartao</p>
          </button>
          <button
            onClick={() => setMode('subscription')}
            className={`p-4 rounded-lg border-2 text-center transition-all ${
              mode === 'subscription'
                ? 'border-primary bg-primary/10'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <Repeat className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className="text-sm font-medium">Assinatura</p>
            <p className="text-xs text-muted-foreground">Cobranca recorrente</p>
          </button>
        </div>
      )}

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {error && !method && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-center space-y-3">
          <AlertCircle className="h-8 w-8 mx-auto text-red-500" />
          <p className="text-sm text-red-500">{error}</p>
          <Button variant="outline" size="sm" onClick={() => setError(null)}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Tentar novamente
          </Button>
        </div>
      )}

      {/* ── Method selection (one-time mode) ────────────────────────────────── */}
      {!method && !error && mode === 'one-time' && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-center text-muted-foreground">
            Escolha o metodo de pagamento:
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              size="lg"
              onClick={handlePixPayment}
              disabled={loading}
              className="h-auto py-6 flex-col gap-2"
            >
              <QrCode className="h-8 w-8 text-green-500" />
              <span className="font-medium">PIX</span>
              <span className="text-xs text-muted-foreground">Aprovacao instantanea*</span>
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={handleCardPayment}
              disabled={loading}
              className="h-auto py-6 flex-col gap-2"
            >
              <CreditCard className="h-8 w-8 text-blue-500" />
              <span className="font-medium">Cartao</span>
              <span className="text-xs text-muted-foreground">Credito</span>
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center">
            *PIX: confirmacao pelo admin apos verificar o pagamento
          </p>
          {loading && (
            <div className="flex justify-center py-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
        </div>
      )}

      {/* ── Subscription goes straight to card ──────────────────────────────── */}
      {!method && !error && mode === 'subscription' && (
        <Button onClick={handleCardPayment} disabled={loading} className="w-full" size="lg">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <CreditCard className="h-4 w-4 mr-2" />
              Iniciar Assinatura com Cartao
            </>
          )}
        </Button>
      )}

      {/* ═══ PIX: QR Code ═══ */}
      {method === 'pix' && pixData && (
        <div className="space-y-4">
          {/* Timer with progress bar */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-500/10 rounded-full text-sm text-green-600">
              <Clock className="h-4 w-4" />
              Expira em {formatTime(timeLeft)}
            </div>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-1000 ease-linear rounded-full"
                style={{ width: `${timerProgress * 100}%` }}
              />
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
            <p className="text-xs text-center text-muted-foreground">
              Ou copie o codigo PIX:
            </p>
            <div className="flex gap-2">
              <input
                readOnly
                value={pixData.qrCode}
                className="flex-1 text-xs bg-muted rounded px-3 py-2 font-mono truncate"
              />
              <Button variant="outline" size="sm" onClick={handleCopyCode}>
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Instructions */}
          <div className="p-4 bg-muted rounded-lg space-y-2">
            <p className="text-sm font-medium">Como pagar:</p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal pl-4">
              <li>Abra o app do seu banco</li>
              <li>Escolha pagar com PIX (QR Code ou Copia e Cola)</li>
              <li>Escaneie o QR ou cole o codigo acima</li>
              <li>
                Confirme o pagamento de <strong>{formatCurrency(amount)}</strong>
              </li>
              <li>Aguarde a confirmacao (nossa equipe verifica e ativa sua conta)</li>
            </ol>
          </div>

          {/* Security badge */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Shield className="h-4 w-4 text-green-500 shrink-0" />
            <span>Apos o pagamento, nossa equipe sera notificada e ativara sua conta.</span>
          </div>

          {/* Back to method selection */}
          <Button variant="ghost" onClick={resetMethod} className="w-full">
            Escolher outro metodo
          </Button>
        </div>
      )}

      {/* ═══ Card: Stripe Elements ═══ */}
      {method === 'card' && clientSecret && (
        <div className="space-y-4">
          <StripePaymentForm
            clientSecret={clientSecret}
            onSuccess={handlePaymentSuccess}
            onError={(msg) => setError(msg)}
            onCancel={resetMethod}
            amount={amount}
            submitLabel={
              mode === 'subscription'
                ? `Assinar por ${formatCurrency(amount)}/${paymentType === 'monthly' ? 'mes' : 'ano'}`
                : undefined
            }
          />
        </div>
      )}

      {/* ── Back button (always visible) ────────────────────────────────────── */}
      <Button variant="ghost" onClick={onBack} className="w-full">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Voltar
      </Button>
    </motion.div>
  )
}
