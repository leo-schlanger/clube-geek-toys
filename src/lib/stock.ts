import { api } from './api-client'

/** Admin stock control. */

export type StockStatus = 'out' | 'low' | 'ok'
export type StockFilter = 'all' | 'low' | 'out'
export type StockMovementKind = 'sale' | 'restock' | 'adjustment' | 'manual_in' | 'manual_out'

export interface StockRow {
  productId: string
  productName: string
  productSlug: string
  variantId: string | null
  variantName: string | null
  sku: string | null
  stock: number
  lowStockThreshold: number
  active: boolean
  imageUrl: string | null
  status: StockStatus
}

export interface StockMovement {
  id: string
  productId: string | null
  variantId: string | null
  orderId: string | null
  kind: StockMovementKind
  /** Signed: negative means stock leaving. */
  quantity: number
  stockAfter: number | null
  note: string | null
  createdAt: string
  productName?: string | null
  variantName?: string | null
  orderNumber?: number | null
}

export interface StockListResult {
  rows: StockRow[]
  total: number
  page: number
  limit: number
  summary: { out: number; low: number; ok: number }
}

export async function listStock(
  params: {
    search?: string
    filter?: StockFilter
    includeInactive?: boolean
    page?: number
    limit?: number
  } = {}
): Promise<StockListResult> {
  const qs = new URLSearchParams()
  if (params.search) qs.set('search', params.search)
  if (params.filter && params.filter !== 'all') qs.set('filter', params.filter)
  if (params.includeInactive) qs.set('includeInactive', 'true')
  if (params.page) qs.set('page', String(params.page))
  if (params.limit) qs.set('limit', String(params.limit))

  const result = await api.get<StockListResult>(`/stock${qs.toString() ? `?${qs}` : ''}`)
  return (
    result.data ?? {
      rows: [],
      total: 0,
      page: 1,
      limit: 50,
      summary: { out: 0, low: 0, ok: 0 },
    }
  )
}

export async function adjustStock(input: {
  productId: string
  variantId?: string | null
  stock: number
  note?: string | null
}): Promise<StockRow | null> {
  const result = await api.patch<StockRow>('/stock', input as unknown as Record<string, unknown>)
  return result.data ?? null
}

export async function setLowStockThreshold(
  productId: string,
  threshold: number
): Promise<boolean> {
  const result = await api.patch(`/stock/${productId}/threshold`, { threshold })
  return !result.error
}

export async function listStockMovements(productId: string): Promise<StockMovement[]> {
  const result = await api.get<{ movements: StockMovement[] }>(`/stock/${productId}/movements`)
  return result.data?.movements ?? []
}

/** Movement label for the history screen. */
export function movementLabel(kind: StockMovementKind): string {
  switch (kind) {
    case 'sale':
      return 'Venda'
    case 'restock':
      return 'Devolução'
    case 'manual_in':
      return 'Entrada manual'
    case 'manual_out':
      return 'Saída manual'
    case 'adjustment':
    default:
      return 'Ajuste'
  }
}
