import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, ShoppingBag } from 'lucide-react'
import { Button } from '../ui/button'
import { Skeleton } from '../ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet'
import { StatusChip, type ChipTone } from './StatusChip'
import { MemberSection, SectionEmpty, SectionError } from './MemberSection'
import { getMyOrder, listMyOrders } from '../../lib/orders'
import { getShopUrl } from '../../lib/subdomain'
import { formatCurrency } from '../../lib/utils'
import { dayMonth, memberSavings, plural, shortDate } from '../../lib/member-card-state'
import type { Order, OrderStatus } from '../../types'

const STATUS: Record<OrderStatus, { label: string; tone: ChipTone }> = {
  pending: { label: 'Aguardando pagamento', tone: 'warning' },
  paid: { label: 'Pago', tone: 'success' },
  processing: { label: 'Em separação', tone: 'primary' },
  shipped: { label: 'Enviado', tone: 'primary' },
  delivered: { label: 'Entregue', tone: 'success' },
  cancelled: { label: 'Cancelado', tone: 'muted' },
  refunded: { label: 'Estornado', tone: 'muted' },
}

const PAGE_SIZE = 10

function itemCount(order: Order): number | null {
  if (!order.items?.length) return null
  return order.items.reduce((n, item) => n + item.quantity, 0)
}

function OrderRow({ order, onOpen }: { order: Order; onOpen: (id: string) => void }) {
  const status = STATUS[order.status] ?? STATUS.pending
  const count = itemCount(order)
  const saved = memberSavings(order)
  const meta = [
    dayMonth(order.createdAt),
    count != null ? plural(count, 'item', 'itens') : null,
    order.deliveryMethod === 'pickup' ? 'retirada na loja' : null,
    saved > 0 ? `economizou ${formatCurrency(saved)}` : null,
  ].filter(Boolean)
  return (
    <button
      type="button"
      onClick={() => onOpen(order.id)}
      className="flex min-h-14 w-full items-center gap-2 border-b border-border py-3 text-left last:border-b-0"
    >
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="font-semibold">Pedido #{order.orderNumber}</span>
          <span className="font-semibold tabular-nums">{formatCurrency(order.total)}</span>
        </span>
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{meta.join(' · ')}</span>
          <StatusChip tone={status.tone}>{status.label}</StatusChip>
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  )
}

/**
 * Order detail inside the club. The session token lives per origin, so a link
 * to the shop's own order page would ask the member to sign in again.
 */
function OrderDetail({ id }: { id: string }) {
  const { data: order, isLoading, isError, refetch } = useQuery({ queryKey: ['orders', 'me', id], queryFn: () => getMyOrder(id) })
  if (isLoading) return <Skeleton className="h-48 w-full" />
  if (isError || !order) return <SectionError onRetry={() => refetch()} />
  const status = STATUS[order.status] ?? STATUS.pending
  const saved = memberSavings(order)
  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">{shortDate(order.createdAt)}</span>
        <StatusChip tone={status.tone}>{status.label}</StatusChip>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {(order.items ?? []).map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="min-w-0">
              <span className="block truncate font-medium">{item.productName}</span>
              <span className="text-xs text-muted-foreground">
                {item.quantity} × {formatCurrency(item.unitPrice)}
              </span>
            </span>
            <span className="tabular-nums">{formatCurrency(item.lineTotal)}</span>
          </li>
        ))}
      </ul>
      <dl className="space-y-1">
        <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular-nums">{formatCurrency(order.subtotal)}</dd></div>
        {order.discount > 0 && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{saved > 0 ? 'Desconto de membro' : 'Desconto'}</dt>
            <dd className="tabular-nums">− {formatCurrency(order.discount)}</dd>
          </div>
        )}
        {order.shippingCost > 0 && (
          <div className="flex justify-between"><dt className="text-muted-foreground">Frete</dt><dd className="tabular-nums">{formatCurrency(order.shippingCost)}</dd></div>
        )}
        <div className="flex justify-between border-t border-border pt-1 font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatCurrency(order.total)}</dd></div>
      </dl>
      {order.trackingCode && (
        <p>
          Rastreio:{' '}
          {order.trackingUrl ? (
            <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer" className="font-mono underline decoration-primary decoration-2 underline-offset-4">
              {order.trackingCode}
            </a>
          ) : (
            <span className="font-mono">{order.trackingCode}</span>
          )}
        </p>
      )}
    </div>
  )
}

function AllOrders({ onOpen }: { onOpen: (id: string) => void }) {
  const [page, setPage] = useState(1)
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['orders', 'me', 'page', page],
    queryFn: () => listMyOrders({ page, limit: PAGE_SIZE }),
  })
  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (isError || !data) return <SectionError onRetry={() => refetch()} />
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
  return (
    <div>
      {data.orders.map((order) => (
        <OrderRow key={order.id} order={order} onOpen={onOpen} />
      ))}
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <Button variant="outline" className="h-11" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} de {pages}
          </span>
          <Button variant="outline" className="h-11" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Próxima
          </Button>
        </div>
      )}
    </div>
  )
}

const linkClass =
  'inline-flex min-h-11 items-center text-sm font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-4'

export function MemberOrders() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['orders', 'me', 'latest'],
    queryFn: () => listMyOrders({ limit: 3 }),
    staleTime: 60_000,
  })
  const [openId, setOpenId] = useState<string | null>(null)
  const [allOpen, setAllOpen] = useState(false)

  if (isLoading) return <Skeleton className="h-[200px] w-full rounded-xl" />

  const orders = data?.orders ?? []
  const shop = getShopUrl()
  const unclaimed = data?.unclaimedGuestOrders ?? 0

  return (
    <MemberSection
      icon={ShoppingBag}
      title="Minhas compras"
      action={
        (data?.total ?? 0) > orders.length ? (
          <button type="button" className={linkClass} onClick={() => setAllOpen(true)}>
            Ver todas
          </button>
        ) : undefined
      }
    >
      {isError ? (
        <SectionError onRetry={() => refetch()} />
      ) : orders.length === 0 ? (
        <SectionEmpty
          action={
            <a href={shop} className={linkClass}>
              Ver a loja
            </a>
          }
        >
          Nenhuma compra ainda. Sua primeira compra vem com brinde.
        </SectionEmpty>
      ) : (
        <div>
          {orders.map((order) => (
            <OrderRow key={order.id} order={order} onOpen={setOpenId} />
          ))}
        </div>
      )}
      {unclaimed > 0 && (
        <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-sm">
          Há {plural(unclaimed, 'compra', 'compras')} como visitante com este e-mail; confirme o e-mail para juntá-las.
        </p>
      )}

      <Sheet open={allOpen} onOpenChange={setAllOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Minhas compras</SheetTitle>
          </SheetHeader>
          <div className="mt-2">{allOpen && <AllOrders onOpen={setOpenId} />}</div>
        </SheetContent>
      </Sheet>
      <Sheet open={openId != null} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Pedido</SheetTitle>
          </SheetHeader>
          <div className="mt-4">{openId && <OrderDetail id={openId} />}</div>
        </SheetContent>
      </Sheet>
    </MemberSection>
  )
}
