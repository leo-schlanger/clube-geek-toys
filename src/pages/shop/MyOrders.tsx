import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Package, ChevronRight, Truck, Loader2, MailWarning } from 'lucide-react'
import type { MyOrdersTab, Order } from '../../types'
import { MY_ORDERS_TAB_STATUSES } from '../../types'
import { listMyOrders } from '../../lib/orders'
import { sendVerificationEmail } from '../../lib/email'
import { formatCurrency, cn } from '../../lib/utils'
import { useAuth } from '../../contexts/AuthContext'
import { ShopHeader } from '../../components/store/ShopHeader'
import { useShopMember } from '../../components/store/useShopMember'
import { SeoHead } from '../../components/store/SeoHead'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { ORDER_STATUS_META } from '../../components/admin/OrderDetailModal'

const TABS: { id: MyOrdersTab; label: string }[] = [
  { id: 'all', label: 'Tudo' },
  { id: 'to_pay', label: 'A pagar' },
  { id: 'preparing', label: 'Preparando' },
  { id: 'on_the_way', label: 'A caminho' },
  { id: 'finished', label: 'Finalizado' },
  { id: 'cancelled', label: 'Cancelado' },
]

export default function MyOrders() {
  const { user, loading: authLoading } = useAuth()
  const { isMember } = useShopMember()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = (searchParams.get('tab') as MyOrdersTab) || 'all'
  const activeTab = MY_ORDERS_TAB_STATUSES[tab] !== undefined ? tab : 'all'

  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  // Guest purchases waiting on e-mail verification. Without this the customer
  // sees an empty list and concludes the order vanished — the order is there,
  // it just cannot be handed over until the address is proven.
  const [pendingGuestOrders, setPendingGuestOrders] = useState(0)
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      navigate('/entrar?next=/minhas-compras', { replace: true })
    }
  }, [user, authLoading, navigate])

  useEffect(() => {
    if (!user) return
    let active = true
    queueMicrotask(() => {
      if (active) setLoading(true)
    })
    listMyOrders({ tab: activeTab, limit: 40 })
      .then((res) => {
        if (!active) return
        setOrders(res.orders)
        setPendingGuestOrders(res.unclaimedGuestOrders ?? 0)
      })
      .catch(() => {
        if (!active) return
        setOrders([])
        // The count came from the response that just failed — keeping the old
        // one would show the notice next to a list that is empty for an
        // entirely different reason.
        setPendingGuestOrders(0)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [user, activeTab])

  async function resendVerification() {
    if (!user || resendState === 'sending') return
    setResendState('sending')
    const result = await sendVerificationEmail(user.email, user.id)
    // A silent failure here reads as a dead button — and the rate limiter makes
    // the second click cost more than the first.
    setResendState(result.success ? 'sent' : 'error')
  }

  function setTab(id: MyOrdersTab) {
    if (id === 'all') setSearchParams({})
    else setSearchParams({ tab: id })
  }

  return (
    <div className="min-h-screen bg-background">
      <SeoHead
        title="Minhas compras"
        description="Acompanhe seus pedidos na loja GeekPop & Toys."
        path="/minhas-compras"
        noIndex
      />
      <ShopHeader isMember={isMember} />

      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-4 text-2xl font-heading font-bold">Minhas compras</h1>

        {pendingGuestOrders > 0 && (
          <div className="mb-6 flex gap-3 rounded-xl border border-accent/40 bg-accent/10 p-4">
            <MailWarning className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div className="min-w-0 text-sm">
              <p className="font-medium">
                {pendingGuestOrders === 1
                  ? 'Encontramos 1 compra feita sem login com este e-mail.'
                  : `Encontramos ${pendingGuestOrders} compras feitas sem login com este e-mail.`}
              </p>
              <p className="mt-1 text-muted-foreground">
                Confirme seu e-mail para {pendingGuestOrders === 1 ? 'ela aparecer' : 'elas aparecerem'} aqui —
                é o que garante que só você veja o endereço e o telefone do pedido.
              </p>
              {resendState === 'sent' ? (
                <p className="mt-2 font-medium text-accent">
                  E-mail de confirmação reenviado. Verifique sua caixa de entrada e o spam.
                </p>
              ) : resendState === 'error' ? (
                <p className="mt-2 font-medium text-destructive">
                  Não conseguimos reenviar agora. Espere alguns minutos e tente de novo, ou fale
                  com a loja.
                </p>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={resendVerification}
                  disabled={resendState === 'sending'}
                >
                  {resendState === 'sending' ? 'Enviando…' : 'Reenviar e-mail de confirmação'}
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="mb-6 flex gap-1 overflow-x-auto border-b pb-px">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                activeTab === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading || authLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Package className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">Nenhum pedido nesta aba.</p>
            <Button asChild>
              <Link to="/">Continuar comprando</Link>
            </Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {orders.map((order) => {
              const meta = ORDER_STATUS_META[order.status]
              const thumb = order.items?.[0]?.imageUrl
              const firstName = order.items?.[0]?.productName
              return (
                <li key={order.id}>
                  <Link
                    to={`/minhas-compras/${order.id}`}
                    className="flex gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-primary/40"
                  >
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {thumb ? (
                        <img src={thumb} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Package className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-mono text-xs text-muted-foreground">
                            Pedido #{order.orderNumber}
                          </p>
                          <p className="truncate font-medium">
                            {firstName}
                            {(order.items?.length ?? 0) > 1
                              ? ` +${(order.items?.length ?? 1) - 1}`
                              : ''}
                          </p>
                        </div>
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-sm">
                        <span className="font-semibold tabular-nums">
                          {formatCurrency(order.total)}
                        </span>
                        {order.trackingCode && (
                          <span className="flex items-center gap-1 text-xs text-primary">
                            <Truck className="h-3.5 w-3.5" />
                            Rastrear
                          </span>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </div>
  )
}
