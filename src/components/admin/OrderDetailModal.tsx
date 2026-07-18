import { useState, useEffect } from 'react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Loading } from '../ui/loading'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card'
import type { Order, OrderStatus } from '../../types'
import { getOrder, updateOrderStatus, confirmPixOrder, refundOrder } from '../../lib/orders'
import { formatCurrency } from '../../lib/utils'
import { logger } from '../../lib/logger'
import { toast } from 'sonner'
import {
  X,
  Package,
  MapPin,
  CreditCard,
  ImageOff,
  CheckCircle,
  RotateCcw,
} from 'lucide-react'

// Shared status metadata (label + badge variant) used across the orders UI.
export const ORDER_STATUS_META: Record<OrderStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'club' }> = {
  pending: { label: 'Pendente', variant: 'warning' },
  paid: { label: 'Pago', variant: 'success' },
  processing: { label: 'Em separação', variant: 'club' },
  shipped: { label: 'Enviado', variant: 'default' },
  delivered: { label: 'Entregue', variant: 'success' },
  cancelled: { label: 'Cancelado', variant: 'destructive' },
  refunded: { label: 'Reembolsado', variant: 'outline' },
}

export const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
]

interface OrderDetailModalProps {
  orderId: string
  onClose: () => void
  /** Refetch the list after any mutation. */
  onChanged: () => void
}

function formatAddress(address: Record<string, unknown> | null): string | null {
  if (!address) return null
  const parts = [
    address.street,
    address.number,
    address.complement,
    address.neighborhood,
    address.city,
    address.state,
    address.zipCode ?? address.zip ?? address.cep,
  ]
    .filter((v) => v != null && String(v).trim() !== '')
    .map((v) => String(v))
  return parts.length > 0 ? parts.join(', ') : null
}

export function OrderDetailModal({ orderId, onClose, onChanged }: OrderDetailModalProps) {
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [statusValue, setStatusValue] = useState<OrderStatus | ''>('')

  useEffect(() => {
    let active = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch order detail when opened
    setLoading(true)
    getOrder(orderId)
      .then((data) => {
        if (!active) return
        setOrder(data)
        setStatusValue(data?.status ?? '')
      })
      .catch((error) => {
        logger.error('Error fetching order:', error)
        if (active) toast.error('Erro ao carregar pedido')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [orderId])

  async function handleUpdateStatus() {
    if (!order || !statusValue || statusValue === order.status) return
    setActionLoading(true)
    try {
      const updated = await updateOrderStatus(order.id, statusValue)
      if (updated) {
        setOrder(updated)
        setStatusValue(updated.status)
        toast.success('Status atualizado')
        onChanged()
      } else {
        toast.error('Erro ao atualizar status')
      }
    } catch (error) {
      logger.error('Error updating order status:', error)
      toast.error('Erro ao atualizar status')
    }
    setActionLoading(false)
  }

  async function handleConfirmPix() {
    if (!order) return
    if (!window.confirm('Confirmar o recebimento do PIX deste pedido?')) return
    setActionLoading(true)
    try {
      const updated = await confirmPixOrder(order.id)
      if (updated) {
        setOrder(updated)
        setStatusValue(updated.status)
        toast.success('PIX confirmado')
        onChanged()
      } else {
        toast.error('Erro ao confirmar PIX')
      }
    } catch (error) {
      logger.error('Error confirming PIX:', error)
      toast.error('Erro ao confirmar PIX')
    }
    setActionLoading(false)
  }

  async function handleRefund() {
    if (!order) return
    if (!window.confirm(`Reembolsar o pedido #${order.orderNumber}? Esta ação não pode ser desfeita.`)) return
    setActionLoading(true)
    try {
      const ok = await refundOrder(order.id)
      if (ok) {
        toast.success('Pedido reembolsado')
        onChanged()
        // Reflect new status locally.
        const refreshed = await getOrder(order.id)
        if (refreshed) {
          setOrder(refreshed)
          setStatusValue(refreshed.status)
        }
      } else {
        toast.error('Erro ao reembolsar pedido')
      }
    } catch (error) {
      logger.error('Error refunding order:', error)
      toast.error('Erro ao reembolsar pedido')
    }
    setActionLoading(false)
  }

  const address = order ? formatAddress(order.shippingAddress) : null
  const canConfirmPix = order?.paymentMethod === 'pix' && order?.status === 'pending'
  const canRefund =
    order?.paymentMethod === 'credit_card' &&
    (order?.status === 'paid' || order?.status === 'processing' || order?.status === 'shipped')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            {order ? `Pedido #${order.orderNumber}` : 'Pedido'}
          </CardTitle>
          <CardDescription>
            {order ? new Date(order.createdAt).toLocaleString('pt-BR') : 'Detalhes do pedido'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loading />
            </div>
          ) : !order ? (
            <p className="text-center text-muted-foreground py-8">Pedido não encontrado</p>
          ) : (
            <>
              {/* Status atual */}
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant={ORDER_STATUS_META[order.status].variant} className="mt-1">
                    {ORDER_STATUS_META[order.status].label}
                  </Badge>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Método</p>
                  <p className="text-sm font-medium">
                    {order.paymentMethod === 'pix'
                      ? 'PIX'
                      : order.paymentMethod === 'credit_card'
                      ? 'Cartão'
                      : '—'}
                  </p>
                </div>
              </div>

              {/* Cliente */}
              <div className="space-y-1">
                <h4 className="font-semibold text-sm">Cliente</h4>
                <p className="text-sm">{order.customerName}</p>
                <p className="text-sm text-muted-foreground">{order.customerEmail}</p>
                {order.customerPhone && (
                  <p className="text-sm text-muted-foreground">{order.customerPhone}</p>
                )}
              </div>

              {/* Endereço */}
              {address && (
                <div className="space-y-1">
                  <h4 className="font-semibold text-sm flex items-center gap-1">
                    <MapPin className="h-4 w-4 text-muted-foreground" /> Endereço de entrega
                  </h4>
                  <p className="text-sm text-muted-foreground">{address}</p>
                </div>
              )}

              {/* Itens */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Itens</h4>
                <div className="space-y-2">
                  {(order.items ?? []).map((item) => (
                    <div key={item.id} className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg">
                      <div className="h-12 w-12 rounded-lg overflow-hidden border border-border bg-muted flex items-center justify-center shrink-0">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <ImageOff className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.productName}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.quantity} × {formatCurrency(item.unitPrice)}
                        </p>
                      </div>
                      <p className="text-sm font-medium">{formatCurrency(item.lineTotal)}</p>
                    </div>
                  ))}
                  {(!order.items || order.items.length === 0) && (
                    <p className="text-sm text-muted-foreground">Sem itens registrados</p>
                  )}
                </div>
              </div>

              {/* Totais */}
              <div className="space-y-1.5 border-t pt-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(order.subtotal)}</span>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Desconto{order.discountReason ? ` (${order.discountReason})` : ''}</span>
                    <span>−{formatCurrency(order.discount)}</span>
                  </div>
                )}
                {order.shippingCost > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Frete</span>
                    <span>{formatCurrency(order.shippingCost)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base pt-1">
                  <span>Total</span>
                  <span>{formatCurrency(order.total)}</span>
                </div>
              </div>

              {/* Alterar status */}
              <div className="space-y-2 border-t pt-4">
                <h4 className="font-semibold text-sm flex items-center gap-1">
                  <CreditCard className="h-4 w-4 text-muted-foreground" /> Alterar status
                </h4>
                <div className="flex gap-2">
                  <select
                    value={statusValue}
                    onChange={(e) => setStatusValue(e.target.value as OrderStatus)}
                    className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {ORDER_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {ORDER_STATUS_META[s].label}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleUpdateStatus}
                    disabled={actionLoading || !statusValue || statusValue === order.status}
                  >
                    {actionLoading ? <Loading size="sm" /> : 'Aplicar'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>

        <CardFooter className="gap-2 flex-wrap">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            Fechar
          </Button>
          {canConfirmPix && (
            <Button
              type="button"
              variant="warning"
              onClick={handleConfirmPix}
              disabled={actionLoading}
              className="flex-1"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Confirmar PIX
            </Button>
          )}
          {canRefund && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleRefund}
              disabled={actionLoading}
              className="flex-1"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reembolsar
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
