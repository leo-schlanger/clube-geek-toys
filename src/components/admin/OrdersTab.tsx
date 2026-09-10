import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Loading } from '../ui/loading'
import { OrderDetailModal, ORDER_STATUS_META, ORDER_STATUSES } from './OrderDetailModal'
import type { Order, OrderStatus } from '../../types'
import { adminListOrders, needsShippingLabel, refundOrder } from '../../lib/orders'
import { formatCurrency } from '../../lib/utils'
import { logger } from '../../lib/logger'
import { toast } from 'sonner'
import { ClipboardList, Eye, RotateCcw, Store, Tag } from 'lucide-react'

export function OrdersTab() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all')
  const [detailId, setDetailId] = useState<string | null>(null)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const result = await adminListOrders(
        statusFilter === 'all' ? {} : { status: statusFilter }
      )
      setOrders(result.orders)
    } catch (error) {
      logger.error('Error fetching orders:', error)
      toast.error('Erro ao carregar pedidos')
    }
    setLoading(false)
  }, [statusFilter])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount/filter change
    fetchOrders()
  }, [fetchOrders])

  const handleRefund = useCallback(
    async (order: Order) => {
      if (!window.confirm(`Reembolsar o pedido #${order.orderNumber}? Esta ação não pode ser desfeita.`)) return
      try {
        const ok = await refundOrder(order.id)
        if (ok) {
          toast.success('Pedido reembolsado')
          fetchOrders()
        } else {
          toast.error('Erro ao reembolsar pedido')
        }
      } catch (error) {
        logger.error('Error refunding order:', error)
        toast.error('Erro ao reembolsar pedido')
      }
    },
    [fetchOrders]
  )

  function canRefund(order: Order): boolean {
    return (
      order.paymentMethod === 'credit_card' &&
      (order.status === 'paid' || order.status === 'processing' || order.status === 'shipped')
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle>Pedidos</CardTitle>
            <CardDescription>Acompanhe e gerencie os pedidos da loja</CardDescription>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as OrderStatus | 'all')}
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="all">Todos os status</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_META[s].label}
              </option>
            ))}
          </select>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loading />
          </div>
        ) : (
          <>
            {/*
              Two layouts for one list, because the shop runs the panel from a
              phone. The table needs six columns and puts "Ações" in the last
              one, so on a 390 px screen the only way into an order — a 32 px
              eye icon with no label — sits off the right edge behind a
              horizontal scroll nobody thinks to try. "Não acho o botão" was
              exactly that. The cards carry the same data with the action
              spelled out.
            */}
            <div className="space-y-3 sm:hidden">
              {orders.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => setDetailId(order.id)}
                  className="flex w-full flex-col gap-2 rounded-lg border border-border p-3 text-left transition-colors active:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-mono font-medium">#{order.orderNumber}</span>
                      {order.deliveryMethod === 'pickup' && (
                        <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                          <Store className="h-3 w-3" />
                          Retirada
                        </span>
                      )}
                      {needsShippingLabel(order) && (
                        <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-medium text-accent">
                          <Tag className="h-3 w-3" />
                          Etiqueta pendente
                        </span>
                      )}
                      <p className="truncate font-medium">{order.customerName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {order.customerEmail}
                      </p>
                    </div>
                    <Badge variant={ORDER_STATUS_META[order.status].variant}>
                      {ORDER_STATUS_META[order.status].label}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {new Date(order.createdAt).toLocaleDateString('pt-BR')}
                    </span>
                    <span className="font-medium">{formatCurrency(order.total)}</span>
                  </div>
                  <span className="flex items-center justify-center gap-1 rounded-md bg-muted py-2 text-sm font-medium">
                    <Eye className="h-4 w-4" />
                    Abrir pedido
                  </span>
                </button>
              ))}
            </div>

            <div className="hidden overflow-x-auto sm:block">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-3 px-4 font-medium text-sm">Pedido</th>
                  <th className="text-left py-3 px-4 font-medium text-sm">Cliente</th>
                  <th className="text-left py-3 px-4 font-medium text-sm">Total</th>
                  <th className="text-left py-3 px-4 font-medium text-sm">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-sm">Data</th>
                  <th className="text-right py-3 px-4 font-medium text-sm">Ações</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b hover:bg-muted/50 transition-colors">
                    <td className="py-4 px-4">
                      <span className="font-medium font-mono">#{order.orderNumber}</span>
                      {/* Pickup and postage become different queues in practice:
                          one goes to the counter, the other to Correios. */}
                      {order.deliveryMethod === 'pickup' && (
                        <span className="mt-1 flex items-center gap-1 text-[11px] font-medium text-primary">
                          <Store className="h-3 w-3" />
                          Retirada
                        </span>
                      )}
                      {/* The queue the shop kept asking for and could only find
                          by opening every order one at a time. */}
                      {needsShippingLabel(order) && (
                        <span className="mt-1 flex items-center gap-1 text-[11px] font-medium text-accent">
                          <Tag className="h-3 w-3" />
                          Etiqueta pendente
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{order.customerName}</p>
                        <p className="text-xs text-muted-foreground truncate">{order.customerEmail}</p>
                      </div>
                    </td>
                    <td className="py-4 px-4 font-medium">{formatCurrency(order.total)}</td>
                    <td className="py-4 px-4">
                      <Badge variant={ORDER_STATUS_META[order.status].variant}>
                        {ORDER_STATUS_META[order.status].label}
                      </Badge>
                    </td>
                    <td className="py-4 px-4 text-sm text-muted-foreground">
                      {new Date(order.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDetailId(order.id)}
                          className="h-8 w-8 p-0"
                          title="Ver detalhes"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {canRefund(order) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRefund(order)}
                            className="text-red-500 hover:text-red-600 hover:bg-red-500/10 h-8 w-8 p-0"
                            title="Reembolsar pedido"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            {orders.length === 0 && (
              <div className="text-center py-12">
                <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground font-medium">Nenhum pedido encontrado</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {statusFilter === 'all'
                    ? 'Os pedidos da loja aparecem aqui'
                    : 'Nenhum pedido com este status'}
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>

      {detailId && (
        <OrderDetailModal
          orderId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={fetchOrders}
        />
      )}
    </Card>
  )
}
