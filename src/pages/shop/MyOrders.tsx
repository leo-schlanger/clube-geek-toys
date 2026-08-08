import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Package, ChevronRight, Truck, Loader2 } from 'lucide-react'
import type { MyOrdersTab, Order } from '../../types'
import { MY_ORDERS_TAB_STATUSES } from '../../types'
import { listMyOrders } from '../../lib/orders'
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
        if (active) setOrders(res.orders)
      })
      .catch(() => {
        if (active) setOrders([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [user, activeTab])

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
