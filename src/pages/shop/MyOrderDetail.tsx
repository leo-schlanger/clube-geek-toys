import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  MapPin,
  Package,
  Star,
  Truck,
} from 'lucide-react'
import type { Order } from '../../types'
import { getMyOrder, cancelMyOrder } from '../../lib/orders'
import { getStoreCredit, listOrderReviews } from '../../lib/reviews'
import { formatCurrency } from '../../lib/utils'
import { useAuth } from '../../contexts/AuthContext'
import { ShopHeader } from '../../components/store/ShopHeader'
import { useShopMember } from '../../components/store/useShopMember'
import { SeoHead } from '../../components/store/SeoHead'
import { OrderReviewForm } from '../../components/store/OrderReviewForm'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { ORDER_STATUS_META } from '../../components/admin/OrderDetailModal'

const TIMELINE: { status: Order['status']; label: string }[] = [
  { status: 'pending', label: 'Pedido criado' },
  { status: 'paid', label: 'Pago' },
  { status: 'processing', label: 'Preparando' },
  { status: 'shipped', label: 'A caminho' },
  { status: 'delivered', label: 'Entregue' },
]

const STATUS_RANK: Record<string, number> = {
  pending: 0,
  paid: 1,
  processing: 2,
  shipped: 3,
  delivered: 4,
  cancelled: -1,
  refunded: -1,
}

export default function MyOrderDetail() {
  const { id } = useParams<{ id: string }>()
  const { user, loading: authLoading } = useAuth()
  const { isMember } = useShopMember()
  const navigate = useNavigate()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set())
  const [rewardAmount, setRewardAmount] = useState(1)
  const [cancelling, setCancelling] = useState(false)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [reviewDone, setReviewDone] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      navigate(`/entrar?next=/minhas-compras/${id}`, { replace: true })
    }
  }, [user, authLoading, navigate, id])

  useEffect(() => {
    if (!user || !id) return
    let active = true
    queueMicrotask(() => {
      if (active) setLoading(true)
    })
    Promise.all([
      getMyOrder(id),
      listOrderReviews(id).catch(() => []),
      getStoreCredit().catch(() => ({ balance: 0, rewardAmount: 1 })),
    ])
      .then(([o, reviews, credit]) => {
        if (!active) return
        setOrder(o)
        setReviewedIds(new Set(reviews.map((r) => r.productId)))
        setRewardAmount(credit.rewardAmount)
        setReviewDone(false)
      })
      .catch(() => {
        if (active) setOrder(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [user, id])

  async function handleCancel() {
    if (!order) return
    setCancelling(true)
    try {
      setOrder(await cancelMyOrder(order.id))
      setConfirmingCancel(false)
      toast.success('Pedido cancelado.')
    } catch (err) {
      // The server explains why (already paid, status changed); show it as-is.
      toast.error(err instanceof Error ? err.message : 'Não foi possível cancelar.')
    } finally {
      setCancelling(false)
    }
  }

  const meta = order ? ORDER_STATUS_META[order.status] : null
  const rank = order ? STATUS_RANK[order.status] ?? 0 : 0
  const cancelled = order?.status === 'cancelled' || order?.status === 'refunded'

  return (
    <div className="min-h-screen bg-background">
      <SeoHead title={order ? `Pedido #${order.orderNumber}` : 'Pedido'} path={`/minhas-compras/${id}`} noIndex />
      <ShopHeader isMember={isMember} />

      <main className="mx-auto max-w-2xl px-4 py-6">
        <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2 text-muted-foreground">
          <Link to="/minhas-compras">
            <ArrowLeft className="h-4 w-4" />
            Minhas compras
          </Link>
        </Button>

        {loading || authLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !order ? (
          <p className="py-16 text-center text-muted-foreground">Pedido não encontrado.</p>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h1 className="font-heading text-2xl font-bold">Pedido #{order.orderNumber}</h1>
                <p className="text-sm text-muted-foreground">
                  {new Date(order.createdAt).toLocaleString('pt-BR')}
                </p>
              </div>
              {meta && <Badge variant={meta.variant}>{meta.label}</Badge>}
            </div>

            {!cancelled && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Acompanhamento</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-3">
                    {TIMELINE.map((step) => {
                      const stepRank = STATUS_RANK[step.status] ?? 0
                      const done = rank >= stepRank
                      return (
                        <li key={step.status} className="flex items-center gap-3 text-sm">
                          <span
                            className={
                              done
                                ? 'h-2.5 w-2.5 rounded-full bg-primary'
                                : 'h-2.5 w-2.5 rounded-full bg-muted'
                            }
                          />
                          <span className={done ? 'font-medium' : 'text-muted-foreground'}>
                            {step.label}
                          </span>
                        </li>
                      )
                    })}
                  </ol>
                  {order.trackingCode && (
                    <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <Truck className="h-4 w-4 text-primary" />
                        Código: <span className="font-mono">{order.trackingCode}</span>
                      </p>
                      {order.trackingUrl && (
                        <a
                          href={order.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          Rastrear nos Correios
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Package className="h-4 w-4" />
                  Itens
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {order.items?.map((item) => (
                  <div key={item.id} className="flex gap-3 text-sm">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{item.productName}</p>
                      <p className="text-muted-foreground">
                        {item.quantity}× {formatCurrency(item.unitPrice)}
                      </p>
                    </div>
                    <span className="tabular-nums">{formatCurrency(item.lineTotal)}</span>
                  </div>
                ))}
                <div className="h-px bg-border" />
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="tabular-nums">{formatCurrency(order.subtotal)}</span>
                  </div>
                  {order.discount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Desconto</span>
                      <span className="tabular-nums">-{formatCurrency(order.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Frete{order.shippingService ? ` (${order.shippingService})` : ''}
                    </span>
                    <span className="tabular-nums">{formatCurrency(order.shippingCost)}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>Total</span>
                    <span className="tabular-nums">{formatCurrency(order.total)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {order.shippingAddress && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MapPin className="h-4 w-4" />
                    Entrega
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <AddressBlock address={order.shippingAddress} />
                </CardContent>
              </Card>
            )}

            {order.status === 'delivered' && order.items && order.items.length > 0 && !reviewDone && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Star className="h-4 w-4 text-accent" />
                    Avaliar compra
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <OrderReviewForm
                    orderId={order.id}
                    items={order.items}
                    alreadyReviewedProductIds={reviewedIds}
                    rewardAmount={rewardAmount}
                    onDone={(credit) => {
                      setReviewDone(true)
                      if (credit > 0) {
                        setReviewedIds(
                          new Set([
                            ...reviewedIds,
                            ...order.items!
                              .map((i) => i.productId)
                              .filter((x): x is string => !!x),
                          ])
                        )
                      } else {
                        setReviewDone(true)
                      }
                    }}
                  />
                </CardContent>
              </Card>
            )}
            {order.status === 'delivered' && reviewDone && (
              <p className="text-center text-sm text-muted-foreground">
                Obrigado pela avaliação!
              </p>
            )}

            {/* Only unpaid orders: once paid it is a refund, which an admin runs. */}
            {order.status === 'pending' && (
              <Card className="border-destructive/30">
                <CardContent className="pt-6">
                  {confirmingCancel ? (
                    <div className="space-y-3">
                      <p className="text-sm">
                        Cancelar o pedido <strong>#{order.orderNumber}</strong>? Não dá
                        para desfazer — se mudar de ideia, é só fazer um novo pedido.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={cancelling}
                          onClick={handleCancel}
                        >
                          {cancelling ? 'Cancelando...' : 'Sim, cancelar pedido'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={cancelling}
                          onClick={() => setConfirmingCancel(false)}
                        >
                          Manter pedido
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground">
                        Ainda não pagou? Você pode cancelar este pedido.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmingCancel(true)}
                      >
                        Cancelar pedido
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function AddressBlock({ address }: { address: Record<string, unknown> }) {
  const a = address as {
    street?: string
    number?: string
    complement?: string
    neighborhood?: string
    city?: string
    state?: string
    cep?: string
  }
  return (
    <p>
      {a.street}, {a.number}
      {a.complement ? ` — ${a.complement}` : ''}
      <br />
      {a.neighborhood} · {a.city}/{a.state}
      <br />
      CEP {a.cep}
    </p>
  )
}
