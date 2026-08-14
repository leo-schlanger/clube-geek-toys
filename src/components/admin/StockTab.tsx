import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Input } from '../ui/input'
import { Loading } from '../ui/loading'
import { Pagination } from '../ui/pagination'
import { useDebounce } from '../../hooks/useDebounce'
import { logger } from '../../lib/logger'
import { toast } from 'sonner'
import {
  listStock,
  adjustStock,
  setLowStockThreshold,
  listStockMovements,
  movementLabel,
  type StockRow,
  type StockFilter,
  type StockMovement,
} from '../../lib/stock'
import { Boxes, Search, History, X, ImageOff, AlertTriangle } from 'lucide-react'

const PAGE_SIZE = 50

/** Identidade da linha: produto simples ou variação. */
function rowKey(row: StockRow): string {
  return row.variantId ?? row.productId
}

const FILTERS: { id: StockFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'low', label: 'Acabando' },
  { id: 'out', label: 'Esgotados' },
]

export function StockTab() {
  const [rows, setRows] = useState<StockRow[]>([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState({ out: 0, low: 0, ok: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<StockFilter>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  const debouncedSearch = useDebounce(search, 300)

  /** Valor sendo digitado por linha (só grava no blur/Enter). */
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [history, setHistory] = useState<{ row: StockRow; movements: StockMovement[] } | null>(null)

  const fetchStock = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listStock({
        search: debouncedSearch.trim() || undefined,
        filter,
        page,
        limit: pageSize,
      })
      setRows(result.rows)
      setTotal(result.total)
      setSummary(result.summary)
      setDrafts({})
    } catch (error) {
      logger.error('Error fetching stock:', error)
      toast.error('Erro ao carregar o estoque')
    }
    setLoading(false)
  }, [debouncedSearch, filter, page, pageSize])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount/filter change
    fetchStock()
  }, [fetchStock])

  const commitStock = useCallback(
    async (row: StockRow) => {
      const key = rowKey(row)
      const raw = drafts[key]
      if (raw === undefined) return

      const next = Number(raw)
      if (!Number.isInteger(next) || next < 0) {
        toast.error('Estoque inválido')
        return
      }
      if (next === row.stock) {
        setDrafts((prev) => {
          const rest = { ...prev }
          delete rest[key]
          return rest
        })
        return
      }

      setSaving(key)
      try {
        const updated = await adjustStock({
          productId: row.productId,
          variantId: row.variantId,
          stock: next,
        })
        if (!updated) {
          toast.error('Erro ao salvar o estoque')
          return
        }
        setRows((prev) => prev.map((r) => (rowKey(r) === key ? updated : r)))
        setDrafts((prev) => {
          const rest = { ...prev }
          delete rest[key]
          return rest
        })
        toast.success(`${row.productName}: estoque ${row.stock} → ${next}`)
      } catch (error) {
        logger.error('Error adjusting stock:', error)
        toast.error('Erro ao salvar o estoque')
      }
      setSaving(null)
    },
    [drafts]
  )

  const commitThreshold = useCallback(async (row: StockRow, value: string) => {
    const threshold = Number(value)
    if (!Number.isInteger(threshold) || threshold < 0 || threshold === row.lowStockThreshold) return
    try {
      const ok = await setLowStockThreshold(row.productId, threshold)
      if (!ok) {
        toast.error('Erro ao salvar o limite')
        return
      }
      // O limiar é do produto: todas as variações dele acompanham.
      setRows((prev) =>
        prev.map((r) =>
          r.productId === row.productId
            ? {
                ...r,
                lowStockThreshold: threshold,
                status: r.stock <= 0 ? 'out' : r.stock <= threshold ? 'low' : 'ok',
              }
            : r
        )
      )
      toast.success('Limite de "acabando" atualizado')
    } catch (error) {
      logger.error('Error setting threshold:', error)
      toast.error('Erro ao salvar o limite')
    }
  }, [])

  const openHistory = useCallback(async (row: StockRow) => {
    try {
      const movements = await listStockMovements(row.productId)
      setHistory({ row, movements })
    } catch (error) {
      logger.error('Error loading movements:', error)
      toast.error('Erro ao carregar o histórico')
    }
  }, [])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Boxes className="h-5 w-5 text-primary" />
              Estoque
            </CardTitle>
            <CardDescription>
              Um item por SKU vendável. Produtos com variação aparecem por variação — é nelas que a
              venda dá baixa.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={summary.out > 0 ? 'destructive' : 'outline'}>
              {summary.out} esgotado(s)
            </Badge>
            <Badge
              variant="outline"
              className={summary.low > 0 ? 'border-amber-500/50 text-amber-600' : ''}
            >
              {summary.low} acabando
            </Badge>
            <Badge variant="secondary">{summary.ok} ok</Badge>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por produto, variação ou SKU..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="pl-10"
            />
          </div>
          <div className="flex gap-1">
            {FILTERS.map((f) => (
              <Button
                key={f.id}
                type="button"
                size="sm"
                variant={filter === f.id ? 'default' : 'outline'}
                onClick={() => {
                  setFilter(f.id)
                  setPage(1)
                }}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loading />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left text-sm font-medium">Item</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">SKU</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Estoque</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Avisar em</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Situação</th>
                  <th className="px-4 py-3 text-right text-sm font-medium">Histórico</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const key = rowKey(row)
                  const draft = drafts[key]
                  return (
                    <tr
                      key={key}
                      className={`border-b transition-colors hover:bg-muted/50 ${
                        row.status === 'out' ? 'bg-red-500/5' : row.status === 'low' ? 'bg-amber-500/5' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                            {row.imageUrl ? (
                              <img src={row.imageUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <ImageOff className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{row.productName}</p>
                            {row.variantName && (
                              <p className="truncate text-xs text-muted-foreground">
                                {row.variantName}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {row.sku || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          inputMode="numeric"
                          className="h-8 w-24"
                          aria-label={`Estoque de ${row.productName}${row.variantName ? ` ${row.variantName}` : ''}`}
                          value={draft ?? String(row.stock)}
                          disabled={saving === key}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                          onBlur={() => commitStock(row)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              ;(e.target as HTMLInputElement).blur()
                            }
                          }}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          className="h-8 w-20"
                          aria-label={`Limite de aviso de ${row.productName}`}
                          defaultValue={row.lowStockThreshold}
                          onBlur={(e) => commitThreshold(row, e.target.value)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {row.status === 'out' ? (
                          <Badge variant="destructive">Esgotado</Badge>
                        ) : row.status === 'low' ? (
                          <Badge
                            variant="outline"
                            className="border-amber-500/50 text-amber-700 dark:text-amber-400"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            Acabando
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Ok</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          title="Ver histórico de movimentação"
                          aria-label={`Histórico de ${row.productName}`}
                          onClick={() => openHistory(row)}
                        >
                          <History className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {rows.length === 0 && (
              <div className="py-12 text-center">
                <Boxes className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <p className="font-medium text-muted-foreground">
                  {filter === 'out'
                    ? 'Nenhum item esgotado'
                    : filter === 'low'
                      ? 'Nenhum item acabando'
                      : 'Nenhum item no estoque'}
                </p>
              </div>
            )}

            {total > 0 && (
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={total}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size)
                  setPage(1)
                }}
                pageSizeOptions={[25, 50, 100, 200]}
              />
            )}
          </div>
        )}
      </CardContent>

      {history && (
        <div className="modal-overlay" onClick={() => setHistory(null)}>
          <Card
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="relative">
              <button
                type="button"
                onClick={() => setHistory(null)}
                className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
                aria-label="Fechar histórico"
              >
                <X className="h-5 w-5" />
              </button>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                Movimentação
              </CardTitle>
              <CardDescription>{history.row.productName}</CardDescription>
            </CardHeader>
            <CardContent>
              {history.movements.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma movimentação registrada ainda. Vendas e ajustes feitos a partir de agora
                  aparecem aqui.
                </p>
              ) : (
                <ul className="space-y-2">
                  {history.movements.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-start justify-between gap-3 rounded-md border border-border p-3 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">
                          {movementLabel(m.kind)}
                          {m.variantName && (
                            <span className="text-muted-foreground"> · {m.variantName}</span>
                          )}
                          {m.orderNumber != null && (
                            <span className="text-muted-foreground"> · pedido #{m.orderNumber}</span>
                          )}
                        </p>
                        {m.note && <p className="text-xs text-muted-foreground">{m.note}</p>}
                        <p className="text-xs text-muted-foreground">
                          {new Date(m.createdAt).toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={`font-medium ${m.quantity < 0 ? 'text-red-500' : 'text-green-600'}`}
                        >
                          {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                        </p>
                        {m.stockAfter != null && (
                          <p className="text-xs text-muted-foreground">→ {m.stockAfter}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </Card>
  )
}
