/**
 * StripePaymentForm — replaces CardTokenizationForm.
 *
 * Uses Stripe Elements (PaymentElement) which handles card tokenization, 3D Secure,
 * PIX QR code display, and all PCI compliance automatically.
 *
 * Props:
 *  - clientSecret: from the backend PaymentIntent / SetupIntent
 *  - onSuccess: called after payment confirms
 *  - onError: called with user-friendly error message
 *  - onCancel: called if user wants to go back
 *  - mode: 'payment' (one-time) or 'setup' (for subscriptions)
 */

import { useState } from 'react'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { getStripePromise } from '../lib/stripe'
import { Button } from './ui/button'
import { Loading } from './ui/loading'
import { toast } from 'sonner'
import { CreditCard, ShieldCheck } from 'lucide-react'

interface StripePaymentFormProps {
  clientSecret: string
  onSuccess: () => void
  onError?: (message: string) => void
  onCancel?: () => void
  submitLabel?: string
  amount?: number
}

function CheckoutForm({ onSuccess, onError, onCancel, submitLabel, amount }: Omit<StripePaymentFormProps, 'clientSecret'>) {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return

    setLoading(true)

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/resultado-pagamento`,
        },
        redirect: 'if_required',
      })

      if (error) {
        const message = error.message || 'Erro ao processar pagamento.'
        toast.error(message)
        onError?.(message)
      } else if (paymentIntent) {
        if (paymentIntent.status === 'succeeded') {
          toast.success('Pagamento confirmado!')
          onSuccess()
        } else if (paymentIntent.status === 'processing') {
          toast.info('Pagamento em processamento. Você será notificado.')
          onSuccess()
        } else if (paymentIntent.status === 'requires_action') {
          // 3D Secure or PIX — Stripe handles this via the redirect flow
          toast.info('Ação adicional necessária...')
        } else {
          toast.error('Status inesperado do pagamento.')
          onError?.('Status inesperado do pagamento.')
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro inesperado.'
      toast.error(message)
      onError?.(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement
        onReady={() => setReady(true)}
        options={{
          layout: 'tabs',
          defaultValues: {
            billingDetails: {
              address: { country: 'BR' },
            },
          },
        }}
      />

      {!ready && (
        <div className="flex justify-center py-4">
          <Loading size="lg" text="Carregando formulário de pagamento..." />
        </div>
      )}

      {ready && (
        <>
          {/* Security badge */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-green-500" />
            <span>Pagamento seguro processado pela Stripe. Seus dados estão protegidos.</span>
          </div>

          <div className="flex gap-3">
            {onCancel && (
              <Button type="button" variant="ghost" onClick={onCancel} disabled={loading} className="flex-1">
                Voltar
              </Button>
            )}
            <Button type="submit" disabled={!stripe || loading} className="flex-1">
              {loading ? (
                <Loading size="sm" />
              ) : (
                <>
                  <CreditCard className="h-4 w-4 mr-2" />
                  {submitLabel || (amount ? `Pagar R$ ${amount.toFixed(2).replace('.', ',')}` : 'Confirmar Pagamento')}
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </form>
  )
}

/**
 * Wrapper that provides the Stripe Elements context.
 * Renders once the clientSecret is available.
 */
export function StripePaymentForm(props: StripePaymentFormProps) {
  const stripePromise = getStripePromise()

  if (!props.clientSecret) {
    return (
      <div className="flex justify-center py-8">
        <Loading size="lg" text="Preparando pagamento..." />
      </div>
    )
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret: props.clientSecret,
        appearance: {
          theme: 'night',
          variables: {
            colorPrimary: '#ec4899',
            colorBackground: '#1a1a2e',
            colorText: '#e0e0e0',
            colorDanger: '#ef4444',
            borderRadius: '8px',
            fontFamily: 'Inter, system-ui, sans-serif',
          },
        },
        locale: 'pt-BR',
      }}
    >
      <CheckoutForm
        onSuccess={props.onSuccess}
        onError={props.onError}
        onCancel={props.onCancel}
        submitLabel={props.submitLabel}
        amount={props.amount}
      />
    </Elements>
  )
}
