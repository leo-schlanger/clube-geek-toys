/**
 * VirtualTable - High-performance table with virtual scrolling
 * Uses @tanstack/react-virtual for rendering only visible rows
 */

import { useRef, useMemo, useState, useCallback, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Input } from './ui/input'
import { Skeleton } from './ui/skeleton'
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { cn } from '../lib/utils'

export interface VirtualColumn<T> {
  key: string
  header: string
  width?: number
  sortable?: boolean
  render?: (item: T) => ReactNode
}

interface VirtualTableProps<T> {
  data: T[]
  columns: VirtualColumn<T>[]
  keyExtractor: (item: T) => string
  rowHeight?: number
  maxHeight?: number
  loading?: boolean
  searchable?: boolean
  searchPlaceholder?: string
  searchKeys?: string[]
  onRowClick?: (item: T) => void
  actions?: (item: T) => ReactNode
  emptyState?: ReactNode
}

type SortDirection = 'asc' | 'desc' | null

export function VirtualTable<T extends Record<string, unknown>>({
  data,
  columns,
  keyExtractor,
  rowHeight = 64,
  maxHeight = 600,
  loading = false,
  searchable = true,
  searchPlaceholder = 'Buscar...',
  searchKeys = [],
  onRowClick,
  actions,
  emptyState,
}: VirtualTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDirection>(null)

  // Filter data
  const filteredData = useMemo(() => {
    if (!search) return data

    const lowerSearch = search.toLowerCase()
    return data.filter((item) =>
      searchKeys.some((key) => {
        const value = item[key]
        if (typeof value === 'string') {
          return value.toLowerCase().includes(lowerSearch)
        }
        if (typeof value === 'number') {
          return value.toString().includes(lowerSearch)
        }
        return false
      })
    )
  }, [data, search, searchKeys])

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortKey || !sortDir) return filteredData

    return [...filteredData].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]

      if (aVal === bVal) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1

      const comparison = aVal < bVal ? -1 : 1
      return sortDir === 'asc' ? comparison : -comparison
    })
  }, [filteredData, sortKey, sortDir])

  // Virtual row calculation
  const virtualizer = useVirtualizer({
    count: sortedData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 5,
  })

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc')
      else if (sortDir === 'desc') {
        setSortKey(null)
        setSortDir(null)
      }
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }, [sortKey, sortDir])

  const getSortIcon = (key: string) => {
    if (sortKey !== key) return <ArrowUpDown className="h-4 w-4" />
    if (sortDir === 'asc') return <ArrowUp className="h-4 w-4" />
    return <ArrowDown className="h-4 w-4" />
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      {searchable && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        {/* Header */}
        <div className="flex bg-muted/50 border-b">
          {columns.map((col) => (
            <div
              key={col.key}
              className="px-4 py-3 font-medium text-sm flex items-center gap-1"
              style={{ width: col.width || 'auto', flex: col.width ? 'none' : 1 }}
            >
              {col.sortable ? (
                <button
                  onClick={() => handleSort(col.key)}
                  className="flex items-center gap-1 hover:text-primary transition-colors"
                >
                  {col.header}
                  {getSortIcon(col.key)}
                </button>
              ) : (
                col.header
              )}
            </div>
          ))}
          {actions && (
            <div className="px-4 py-3 font-medium text-sm w-24 text-right">
              Ações
            </div>
          )}
        </div>

        {/* Virtual rows */}
        <div
          ref={parentRef}
          className="overflow-auto"
          style={{ maxHeight }}
        >
          {sortedData.length === 0 ? (
            <div className="py-12 text-center">
              {emptyState || (
                <p className="text-muted-foreground">Nenhum resultado encontrado</p>
              )}
            </div>
          ) : (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const item = sortedData[virtualRow.index]
                return (
                  <div
                    key={keyExtractor(item)}
                    className={cn(
                      "absolute top-0 left-0 w-full flex items-center border-b transition-colors",
                      onRowClick && "cursor-pointer hover:bg-muted/50"
                    )}
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    onClick={() => onRowClick?.(item)}
                  >
                    {columns.map((col) => (
                      <div
                        key={col.key}
                        className="px-4 py-2"
                        style={{ width: col.width || 'auto', flex: col.width ? 'none' : 1 }}
                      >
                        {col.render ? col.render(item) : String(item[col.key] ?? '')}
                      </div>
                    ))}
                    {actions && (
                      <div className="px-4 py-2 w-24 text-right">
                        {actions(item)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Row count */}
      <p className="text-sm text-muted-foreground">
        {sortedData.length} de {data.length} itens
      </p>
    </div>
  )
}
