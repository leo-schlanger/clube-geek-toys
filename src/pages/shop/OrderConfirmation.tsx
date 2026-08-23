import { useState, useEffect, useRef } from 'react'
import { useParams, useLocation, Link } from 'react-router-dom'
import { CheckCircle2, Clock, XCircle, Loader2, ShoppingBag, Home } from 'lucide-react'
import type { OrderStatus } from '../../types'
import { getOrderStatus, getOrderPix, type OrderPixInfo } from '../../lib/orders'
import { useCart } from '../../contexts/CartContext'
import { ShopHeader } from '../../components/store/ShopHeader'
import { useShopMember } from '../../components/store/useShopMember'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import { PixPaymentPanel } from '../../components/store/PixPaymentPanel'

const POLL_INTERVAL_MS = 4000
const POLL_TIMEOUT_MS = 5 * 60 * 1000 // Stop polling after 5 min

// Settled states, which stop the polling.
const TERMINAL_STATUSES: OrderStatus[] = [
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
]

export default function OrderConfirmation() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const { clear } = useCart()
  // This page doubles as the public order page linked from the confirmation
  // e-mail, which a customer may open days later with a new cart in progress.
  // Only a visit that came straight from checkout is allowed to empty it.
  const cameFromCheckout = (location.state as { fromCheckout?: boolean } | null)?.fromCheckout === true
  const { isMember } = useShopMember()

  const [status, setStatus] = useState<OrderStatus | null>(null)
  const [orderNumber, setOrderNumber] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [timedOut, setTimedOut] = useState(false)

  const [pix, setPix] = useState<OrderPixInfo | null>(null)

  const clearedRef = useRef(false)
  const startRef = useRef(Date.now())

  useEffect(() => {
    if (!id) return

    let active = true
    let timer: ReturnType<typeof setTimeout>

    async function poll() {
      try {
        const info = await getOrderStatus(id as string)
        if (!active) return

        if (!info) {
          setNotFound(true)
          setLoading(false)
          return
        }

        setStatus(info.status)
        setOrderNumber(info.orderNumber)
        setLoading(false)

        const isPaid = info.status === 'paid' || TERMINAL_STATUSES.includes(info.status)

        // Clear the cart once, as soon as the order is confirmed.
        if (
          cameFromCheckout &&
          !clearedRef.current &&
          info.status !== 'pending' &&
          info.status !== 'cancelled' &&
          info.status !== 'refunded'
        ) {
          clearedRef.current = true
          clear()
        }

        if (isPaid) return

        if (Date.now() - startRef.current > POLL_TIMEOUT_MS) {
          setTimedOut(true)
          return
        }

        timer = setTimeout(poll, POLL_INTERVAL_MS)
      } catch {
        if (!active) return
        // Transient error: retry within the timeout.
        if (Date.now() - startRef.current > POLL_TIMEOUT_MS) {
          setTimedOut(true)
          setLoading(false)
          return
        }
        timer = setTimeout(poll, POLL_INTERVAL_MS)
      }
    }

    poll()

    return () => {
      active = false
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  /**
   * The PIX code, fetched from the server rather than carried in navigation
   * state. Coming from checkout the component that held the EMV is already
   * unmounted, and a guest opening the e-mail link never had it at all.
   */
  useEffect(() => {
    if (!id || status !== 'pending') return
    let active = true
    void getOrderPix(id).then((info) => {
      if (active) setPix(info)
    })
    return () => {
      active = false
    }
  }, [id, status])

  const isPaid =
    status === 'paid' ||
    status === 'processing' ||
    status === 'shipped' ||
    status === 'delivered'
  const isCancelled = status === 'cancelled' || status === 'refunded'
  const isPending = status === 'pending'

  return (
    <div className="min-h-screen bg-background">
      <ShopHeader isMember={isMember} />

      <main
        className={`mx-auto flex flex-col items-center px-4 py-12 ${
          pix ? 'max-w-2xl' : 'max-w-lg'
        }`}
      >
        <Card className="w-full">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            {notFound ? (
              <>
                <XCircle className="h-16 w-16 text-destructive" />
                <div>
                  <h1 className="text-xl font-heading font-bold">Pedido não encontrado</h1>
                  <p className="text-muted-foreground">
                    Não localizamos este pedido. Verifique o link.
                  </p>
                </div>
              </>
            ) : loading ? (
              <>
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
                <p className="text-muted-foreground">Carregando seu pedido...</p>
              </>
            ) : isPaid ? (
              <>
                <CheckCircle2 className="h-16 w-16 text-green-500" />
                <div>
                  <h1 className="text-2xl font-heading font-bold">Pagamento confirmado!</h1>
                  <p className="text-muted-foreground">
                    Seu pedido foi recebido com sucesso. Enviamos os detalhes por email.
                  </p>
                </div>
              </>
            ) : isCancelled ? (
              <>
                <XCircle className="h-16 w-16 text-destructive" />
                <div>
                  <h1 className="text-xl font-heading font-bold">Pedido cancelado</h1>
                  <p className="text-muted-foreground">
                    Este pedido foi cancelado. Se precisar, faça um novo pedido.
                  </p>
                </div>
              </>
            ) : (
              /* Pending (PIX awaiting confirmation) or timed out */
              <>
                <div className="relative">
                  <Clock className="h-16 w-16 text-yellow-500" />
                  {!timedOut && (
                    <Loader2 className="absolute -right-1 -top-1 h-5 w-5 animate-spin text-yellow-500" />
                  )}
                </div>
                <div>
                  <h1 className="text-xl font-heading font-bold">
                    {timedOut ? 'Aguardando confirmação' : 'Aguardando pagamento'}
                  </h1>
                  <p className="text-muted-foreground">
                    {/* Card settles by Stripe webhook; PIX is checked by a
                        person. Saying "automatic" for PIX was the promise the
                        system could not keep. */}
                    {isPending && pix
                      ? 'A equipe confere o PIX e confirma o pedido — não é automático, e pode levar algumas horas em horário comercial. Enviamos o código para o seu e-mail: pode fechar esta página sem perder nada.'
                      : isPending
                        ? 'Assim que o pagamento for identificado, seu pedido é confirmado e você recebe um e-mail.'
                        : 'Estamos verificando o status do seu pagamento.'}
                  </p>
                </div>
                {timedOut && (
                  <p className="text-xs text-muted-foreground">
                    A verificação automática pausou. Atualize a página para checar novamente.
                  </p>
                )}
              </>
            )}

            {orderNumber != null && (
              <div className="rounded-lg bg-muted px-4 py-2">
                <span className="text-sm text-muted-foreground">Número do pedido</span>
                <p className="text-lg font-semibold tabular-nums">#{orderNumber}</p>
              </div>
            )}

            {/* The code itself, not just a promise of it: this page is where a
                guest who closed the checkout tab lands. */}
            {isPending && pix && (
              <PixPaymentPanel
                emvCode={pix.pix.emvCode}
                pixKey={pix.pix.pixKey}
                amount={pix.total}
                reference={`#${pix.orderNumber}`}
                className="w-full text-left"
              />
            )}

            <div className="flex w-full flex-col gap-2 pt-2 sm:flex-row">
              <Button asChild variant="outline" className="flex-1">
                <Link to="/">
                  <Home className="h-4 w-4" />
                  Voltar à loja
                </Link>
              </Button>
              <Button asChild className="flex-1">
                <Link to="/">
                  <ShoppingBag className="h-4 w-4" />
                  Continuar comprando
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
