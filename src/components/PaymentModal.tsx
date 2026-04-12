/**
 * PaymentModal — Stripe integration.
 *
 * Flow:
 * 1. User chooses mode: subscription (recurring) or one-time
 * 2. Frontend calls backend to create PaymentIntent/Subscription → gets clientSecret
 * 3. StripePaymentForm renders Stripe Elements (card + PIX + 3DS) using the clientSecret
 * 4. User completes payment directly with Stripe
 * 5. Webhook arrives server-side → activates member
 * 6. onSuccess callback closes modal and navigates
 *
 * PIX is handled natively by Stripe's PaymentElement — no manual QR code rendering needed.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { paymentLogger } from '../lib/logger'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Loading } from './ui/loading'
import { StripePaymentForm } from './StripePaymentForm'
import { isPaymentConfigured, checkPaymentStatus } from '../lib/payments'
import { PLANS, type PlanType, type PaymentType, type PendingPaymentInfo } from '../types'
import { formatCurrency } from '../lib/utils'
import { savePendingPayment, clearPendingPayment } from '../lib/members'
import { api } from '../lib/api-client'
import { toast } from 'sonner'
import {
  X,
  CreditCard,
  Repeat,
  Zap,
  Shield,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'

type PaymentMode = 'subscription' | 'one-time'

interface PaymentModalProps {
  plan: PlanType
  paymentType: PaymentType
  memberEmail?: string
  memberId?: string
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
  initialPendingPayment,
  onClose,
  onSuccess,
  defaultMode = 'one-time',
  allowModeSwitch = true,
}: PaymentModalProps) {
  const [mode, setMode] = useState<PaymentMode>(defaultMode)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, setPaymentIntentId] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const planData = PLANS[plan]
  const amount = paymentType === 'monthly' ? planData.priceMonthly : planData.priceAnnual
  const isConfigured = isPaymentConfigured()

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  // Check for previous pending payment on mount
  useEffect(() => {
    if (initialPendingPayment && isConfigured) {
      handleCheckPrevious(initialPendingPayment)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPendingPayment])

  async function handleCheckPrevious(pending: PendingPaymentInfo) {
    const expiresAt = new Date(pending.expiresAt)
    if (expiresAt < new Date()) {
      if (memberId !== 'temp_member') await clearPendingPayment(memberId)
      return
    }
    toast.loading('Verificando pagamento anterior...', { id: 'check-prev' })
    const status = await checkPaymentStatus(pending.paymentId)
    if (status === 'paid') {
      toast.success('Pagamento anterior confirmado!', { id: 'check-prev' })
      if (memberId !== 'temp_member') await clearPendingPayment(memberId)
      onSuccess()
    } else if (status === 'failed') {
      toast.error('Pagamento anterior não foi aprovado. Gere um novo.', { id: 'check-prev' })
      if (memberId !== 'temp_member') await clearPendingPayment(memberId)
    } else {
      toast.dismiss('check-prev')
      // Continue with existing payment — set the clientSecret if we had one stored
      // In practice, user should just create a new payment intent.
    }
  }

  /**
   * Create a PaymentIntent on our backend and get the clientSecret for Stripe Elements.
   */
  const createPaymentIntent = useCallback(async () => {
    if (!isConfigured) {
      setError('Sistema de pagamento não configurado.')
      return
    }

    setLoading(true)
    setError(null)
    setClientSecret(null)

    try {
      let result: { clientSecret?: string; paymentIntentId?: string; id?: string; error?: string; code?: string }

      if (mode === 'subscription') {
        // Create Stripe Subscription
        const res = await api.post<{ clientSecret: string; id: string; status: string }>('/subscription/create', {
          member_id: memberId,
          plan,
          frequency_type: paymentType === 'monthly' ? 'months' : 'years',
          payer_email: memberEmail,
          payer_name: 'Membro',
          transaction_amount: amount,
        })
        if (res.error) throw new Error(res.error)
        result = {
          clientSecret: (res.data as { clientSecret?: string })?.clientSecret,
          id: (res.data as { id?: string })?.id,
        }
      } else {
        // Create one-time PaymentIntent (card + PIX)
        const res = await api.post<{ clientSecret: string; paymentIntentId: string }>('/checkout/create', {
          amount,
          description: `Clube Geek & Toys - Plano ${planData.name}`,
          payer_email: memberEmail,
          payer_name: 'Membro',
          external_reference: memberId,
        })
        if (res.error) throw new Error(res.error)
        result = {
          clientSecret: (res.data as { clientSecret?: string })?.clientSecret,
          paymentIntentId: (res.data as { paymentIntentId?: string })?.paymentIntentId,
        }
      }

      if (!result.clientSecret) {
        throw new Error('Não foi possível inicializar o pagamento.')
      }

      setClientSecret(result.clientSecret)
      setPaymentIntentId(result.paymentIntentId || result.id || null)

      // Save pending payment info for recovery
      if (memberId !== 'temp_member' && result.paymentIntentId) {
        await savePendingPayment(memberId, {
          paymentId: result.paymentIntentId,
          qrCode: '',
          amount,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          createdAt: new Date().toISOString(),
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao iniciar pagamento.'
      paymentLogger.error('Error creating payment intent:', err)
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [isConfigured, mode, memberId, plan, paymentType, amount, memberEmail, planData.name])

  function handlePaymentSuccess() {
    if (memberId !== 'temp_member') {
      clearPendingPayment(memberId).catch(() => {})
    }
    if (pollRef.current) clearInterval(pollRef.current)
    onSuccess()
  }

  function handlePaymentError(message: string) {
    setError(message)
  }

  // Not configured state
  if (!isConfigured) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <Card className="w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
            <CardTitle>Pagamento não disponível</CardTitle>
            <CardDescription>O sistema de pagamento não está configurado.</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button variant="outline" onClick={onClose}>Fechar</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <Card className="w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="relative">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Pagamento
          </CardTitle>
          <CardDescription>
            Plano {planData.name} — {formatCurrency(amount)}
            {paymentType === 'monthly' ? '/mês' : '/ano'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Mode switch */}
          {allowModeSwitch && !clientSecret && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMode('one-time')}
                className={`p-3 rounded-lg border-2 text-center transition-all ${
                  mode === 'one-time'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <Zap className="h-5 w-5 mx-auto mb-1 text-primary" />
                <p className="text-sm font-medium">Pagamento Único</p>
                <p className="text-xs text-muted-foreground">PIX ou Cartão</p>
              </button>
              <button
                onClick={() => setMode('subscription')}
                className={`p-3 rounded-lg border-2 text-center transition-all ${
                  mode === 'subscription'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                }`}
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
                {mode === 'subscription' ? 'Recorrente' : 'Pagamento único'}
                {' · '}{paymentType === 'monthly' ? 'Mensal' : 'Anual'}
              </p>
            </div>
            <Badge variant="default" className="text-lg px-3 py-1">
              {formatCurrency(amount)}
            </Badge>
          </div>

          {/* Security badge */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Shield className="h-4 w-4 text-green-500" />
            <span>Pagamento seguro via Stripe. Seus dados nunca passam pelo nosso servidor.</span>
          </div>

          {/* Error state */}
          {error && !clientSecret && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-center space-y-3">
              <AlertCircle className="h-8 w-8 mx-auto text-red-500" />
              <p className="text-sm text-red-500">{error}</p>
              <Button variant="outline" size="sm" onClick={() => { setError(null); createPaymentIntent() }}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Tentar novamente
              </Button>
            </div>
          )}

          {/* Step 1: Create PaymentIntent */}
          {!clientSecret && !error && (
            <Button
              onClick={createPaymentIntent}
              disabled={loading}
              className="w-full"
              size="lg"
            >
              {loading ? (
                <Loading size="sm" />
              ) : (
                <>
                  <CreditCard className="h-4 w-4 mr-2" />
                  {mode === 'subscription' ? 'Iniciar Assinatura' : 'Prosseguir para Pagamento'}
                </>
              )}
            </Button>
          )}

          {/* Step 2: Stripe Elements — card/PIX/3DS handled automatically */}
          {clientSecret && (
            <StripePaymentForm
              clientSecret={clientSecret}
              onSuccess={handlePaymentSuccess}
              onError={handlePaymentError}
              onCancel={() => { setClientSecret(null); setError(null) }}
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
