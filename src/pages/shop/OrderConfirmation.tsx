import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { CheckCircle2, Clock, XCircle, Loader2, ShoppingBag, Home } from 'lucide-react'
import type { OrderStatus } from '../../types'
import { getOrderStatus } from '../../lib/orders'
import { useCart } from '../../contexts/CartContext'
import { ShopHeader } from '../../components/store/ShopHeader'
import { useShopMember } from '../../components/store/useShopMember'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'

const POLL_INTERVAL_MS = 4000
const POLL_TIMEOUT_MS = 5 * 60 * 1000 // desiste de esperar após 5 min

// Estados que consideramos "resolvidos" — param o polling.
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
  const { clear } = useCart()
  const { isMember } = useShopMember()

  const [status, setStatus] = useState<OrderStatus | null>(null)
  const [orderNumber, setOrderNumber] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [timedOut, setTimedOut] = useState(false)

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

        // Limpa o carrinho assim que o pedido é confirmado (uma única vez).
        if (
          !clearedRef.current &&
          info.status !== 'pending' &&
          info.status !== 'cancelled' &&
          info.status !== 'refunded'
        ) {
          clearedRef.current = true
          clear()
        }

        if (isPaid) return // resolvido — para o polling

        if (Date.now() - startRef.current > POLL_TIMEOUT_MS) {
          setTimedOut(true)
          return
        }

        timer = setTimeout(poll, POLL_INTERVAL_MS)
      } catch {
        if (!active) return
        // Erro transitório — tenta de novo dentro do timeout.
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

      <main className="mx-auto flex max-w-lg flex-col items-center px-4 py-12">
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
              /* Pendente (PIX aguardando confirmação) ou timeout */
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
                    {isPending
                      ? 'Assim que o pagamento PIX for identificado, seu pedido será confirmado automaticamente. Você pode fechar esta página — enviaremos um email.'
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

            <div className="flex w-full flex-col gap-2 pt-2 sm:flex-row">
              <Button asChild variant="outline" className="flex-1">
                <Link to="/">
                  <Home className="mr-2 h-4 w-4" />
                  Voltar à loja
                </Link>
              </Button>
              <Button asChild className="flex-1">
                <Link to="/">
                  <ShoppingBag className="mr-2 h-4 w-4" />
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
