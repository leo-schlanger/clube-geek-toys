import { useState, useMemo, useCallback, useEffect, type ReactNode } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import { Pagination } from './ui/pagination'
import { Skeleton } from './ui/skeleton'
import {
  Search,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  Columns,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react'

// ============================================
// TYPES
// ============================================

export interface Column<T> {
  key: string
  header: string
  sortable?: boolean
  width?: string
  render?: (item: T) => ReactNode
  className?: string
}

export interface FilterOption {
  value: string
  label: string
  icon?: ReactNode
  color?: string
}

export interface FilterConfig {
  key: string
  label: string
  type: 'select' | 'multiselect' | 'date' | 'daterange' | 'number' | 'numberrange'
  options?: FilterOption[]
  placeholder?: string
}

export interface TableState {
  search: string
  filters: Record<string, unknown>
  sortKey: string | null
  sortOrder: 'asc' | 'desc'
  page: number
}

export interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  keyExtractor: (item: T) => string
  filters?: FilterConfig[]
  searchPlaceholder?: string
  searchKeys?: string[]
  onRowClick?: (item: T) => void
  actions?: (item: T) => ReactNode
  emptyState?: ReactNode
  loading?: boolean
  exportFilename?: string
  exportData?: (items: T[]) => string[][]
  /** Estado inicial da tabela (para sincronizar com URL) */
  initialState?: Partial<TableState>
  /** Callback quando o estado muda (para sincronizar com URL) */
  onStateChange?: (state: TableState) => void
}

// ============================================
// FILTER CHIP COMPONENT
// ============================================

function FilterChip({
  label,
  value,
  onRemove,
}: {
  label: string
  value: string
  onRemove: () => void
}) {
  return (
    <Badge variant="secondary" className="gap-1 pr-1">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
      <button
        onClick={onRemove}
        className="ml-1 p-0.5 rounded hover:bg-muted-foreground/20"
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  keyExtractor,
  filters = [],
  searchPlaceholder = 'Buscar...',
  searchKeys = [],
  onRowClick,
  actions,
  emptyState,
  loading = false,
  exportFilename = 'export',
  exportData,
  initialState,
  onStateChange,
}: DataTableProps<T>) {
  // State (initialized from initialState if provided)
  const [search, setSearch] = useState(initialState?.search ?? '')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [activeFilters, setActiveFilters] = useState<Record<string, any>>(initialState?.filters ?? {})
  const [sortKey, setSortKey] = useState<string | null>(initialState?.sortKey ?? null)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(initialState?.sortOrder ?? 'asc')
  const [currentPage, setCurrentPage] = useState(initialState?.page ?? 1)
  const [pageSize, setPageSize] = useState(10)
  const [showFilters, setShowFilters] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState<string[]>(columns.map((c) => c.key))

  // Sync state changes to URL (via callback)
  useEffect(() => {
    if (onStateChange) {
      onStateChange({
        search,
        filters: activeFilters,
        sortKey,
        sortOrder,
        page: currentPage,
      })
    }
  }, [search, activeFilters, sortKey, sortOrder, currentPage, onStateChange])
  const [showColumnPicker, setShowColumnPicker] = useState(false)

  // Filter data
  const filteredData = useMemo(() => {
    let result = [...data]

    // Search filter
    if (search && searchKeys.length > 0) {
      const searchLower = search.toLowerCase()
      result = result.filter((item) =>
        searchKeys.some((key) => {
          const value = item[key]
          if (typeof value === 'string') {
            return value.toLowerCase().includes(searchLower)
          }
          if (typeof value === 'number') {
            return value.toString().includes(search)
          }
          return false
        })
      )
    }

    // Apply active filters
    Object.entries(activeFilters).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return
      if (Array.isArray(value) && value.length === 0) return

      result = result.filter((item) => {
        const itemValue = item[key]

        // Multi-select filter
        if (Array.isArray(value)) {
          return value.includes(itemValue)
        }

        // Date range filter
        if (typeof value === 'object' && ('from' in value || 'to' in value)) {
          const itemDate = new Date(itemValue)
          if (value.from && itemDate < new Date(value.from)) return false
          if (value.to && itemDate > new Date(value.to)) return false
          return true
        }

        // Number range filter
        if (typeof value === 'object' && ('min' in value || 'max' in value)) {
          const num = Number(itemValue)
          if (value.min !== undefined && num < value.min) return false
          if (value.max !== undefined && num > value.max) return false
          return true
        }

        // Direct match
        return itemValue === value
      })
    })

    // Sort
    if (sortKey) {
      result.sort((a, b) => {
        const aVal = a[sortKey]
        const bVal = b[sortKey]

        if (aVal === bVal) return 0
        if (aVal === null || aVal === undefined) return 1
        if (bVal === null || bVal === undefined) return -1

        let comparison = 0
        if (typeof aVal === 'string') {
          comparison = aVal.localeCompare(bVal)
        } else if (typeof aVal === 'number') {
          comparison = aVal - bVal
        } else if (aVal instanceof Date) {
          comparison = aVal.getTime() - new Date(bVal).getTime()
        } else {
          comparison = String(aVal).localeCompare(String(bVal))
        }

        return sortOrder === 'asc' ? comparison : -comparison
      })
    }

    return result
  }, [data, search, searchKeys, activeFilters, sortKey, sortOrder])

  // Paginated data
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredData.slice(start, start + pageSize)
  }, [filteredData, currentPage, pageSize])

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize))

  // Reset page when filters change
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleFilterChange = useCallback((key: string, value: any) => {
    setActiveFilters((prev) => ({ ...prev, [key]: value }))
    setCurrentPage(1)
  }, [])

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
    setCurrentPage(1)
  }, [])

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortOrder('asc')
    }
  }, [sortKey])

  const clearAllFilters = useCallback(() => {
    setSearch('')
    setActiveFilters({})
    setCurrentPage(1)
  }, [])

  const handleExport = useCallback(() => {
    if (!exportData) return

    const rows = exportData(filteredData)
    const csvContent = rows.map((row) => row.join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${exportFilename}_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }, [filteredData, exportData, exportFilename])

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (search) count++
    Object.values(activeFilters).forEach((v) => {
      if (v && (!Array.isArray(v) || v.length > 0)) count++
    })
    return count
  }, [search, activeFilters])

  // Visible columns
  const displayColumns = useMemo(
    () => columns.filter((c) => visibleColumns.includes(c.key)),
    [columns, visibleColumns]
  )

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
        {/* Search */}
        <div className="relative w-full lg:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10 pr-10"
          />
          {search && (
            <button
              onClick={() => handleSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 w-full lg:w-auto">
          {/* Filters toggle */}
          {filters.length > 0 && (
            <Button
              variant={showFilters ? 'secondary' : 'outline'}
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filtros
              {activeFilterCount > 0 && (
                <Badge className="h-5 min-w-5 p-0 flex items-center justify-center text-xs">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          )}

          {/* Column picker */}
          <div className="relative">
            <Button
              variant="outline"
              onClick={() => setShowColumnPicker(!showColumnPicker)}
              className="gap-2"
            >
              <Columns className="h-4 w-4" />
              Colunas
            </Button>
            {showColumnPicker && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowColumnPicker(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-56 bg-card border rounded-lg shadow-lg z-50 p-2">
                  <p className="text-xs font-medium text-muted-foreground px-2 py-1">
                    Colunas visíveis
                  </p>
                  {columns.map((col) => (
                    <label
                      key={col.key}
                      className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns.includes(col.key)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setVisibleColumns([...visibleColumns, col.key])
                          } else if (visibleColumns.length > 1) {
                            setVisibleColumns(visibleColumns.filter((k) => k !== col.key))
                          }
                        }}
                        className="rounded border-border"
                      />
                      <span className="text-sm">{col.header}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Export */}
          {exportData && (
            <Button variant="outline" onClick={handleExport} className="gap-2">
              <Download className="h-4 w-4" />
              Exportar
            </Button>
          )}

          {/* Clear filters */}
          {activeFilterCount > 0 && (
            <Button variant="ghost" onClick={clearAllFilters} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Limpar filtros
            </Button>
          )}
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && filters.length > 0 && (
        <div className="p-4 bg-muted/30 rounded-lg border space-y-4 animate-in fade-in slide-in-from-top-2">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {filters.map((filter) => (
              <div key={filter.key} className="space-y-1.5">
                <label className="text-sm font-medium">{filter.label}</label>
                {filter.type === 'multiselect' && filter.options && (
                  <div className="flex flex-wrap gap-1.5">
                    {filter.options.map((opt) => {
                      const isActive = activeFilters[filter.key]?.includes(opt.value)
                      return (
                        <button
                          key={opt.value}
                          onClick={() => {
                            const current = activeFilters[filter.key] || []
                            const updated = isActive
                              ? current.filter((v: string) => v !== opt.value)
                              : [...current, opt.value]
                            handleFilterChange(filter.key, updated)
                          }}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                            isActive
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-background border hover:bg-muted'
                          }`}
                        >
                          {opt.icon}
                          {opt.color && (
                            <span className={`w-2 h-2 rounded-full ${opt.color}`} />
                          )}
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                )}
                {filter.type === 'select' && filter.options && (
                  <select
                    value={activeFilters[filter.key] || ''}
                    onChange={(e) => handleFilterChange(filter.key, e.target.value || undefined)}
                    className="w-full px-3 py-2 rounded-md border bg-background text-sm"
                  >
                    <option value="">Todos</option>
                    {filter.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                )}
                {filter.type === 'daterange' && (
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      placeholder="De"
                      value={activeFilters[filter.key]?.from || ''}
                      onChange={(e) =>
                        handleFilterChange(filter.key, {
                          ...activeFilters[filter.key],
                          from: e.target.value || undefined,
                        })
                      }
                      className="flex-1"
                    />
                    <Input
                      type="date"
                      placeholder="Até"
                      value={activeFilters[filter.key]?.to || ''}
                      onChange={(e) =>
                        handleFilterChange(filter.key, {
                          ...activeFilters[filter.key],
                          to: e.target.value || undefined,
                        })
                      }
                      className="flex-1"
                    />
                  </div>
                )}
                {filter.type === 'numberrange' && (
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="Mín"
                      value={activeFilters[filter.key]?.min ?? ''}
                      onChange={(e) =>
                        handleFilterChange(filter.key, {
                          ...activeFilters[filter.key],
                          min: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      placeholder="Máx"
                      value={activeFilters[filter.key]?.max ?? ''}
                      onChange={(e) =>
                        handleFilterChange(filter.key, {
                          ...activeFilters[filter.key],
                          max: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      className="flex-1"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {search && (
            <FilterChip
              label="Busca"
              value={search}
              onRemove={() => handleSearchChange('')}
            />
          )}
          {Object.entries(activeFilters).map(([key, value]) => {
            if (!value || (Array.isArray(value) && value.length === 0)) return null
            const filter = filters.find((f) => f.key === key)
            if (!filter) return null

            if (Array.isArray(value)) {
              const labels = value
                .map((v) => filter.options?.find((o) => o.value === v)?.label || v)
                .join(', ')
              return (
                <FilterChip
                  key={key}
                  label={filter.label}
                  value={labels}
                  onRemove={() => handleFilterChange(key, [])}
                />
              )
            }

            if (typeof value === 'object') {
              const parts = []
              if (value.from) parts.push(`de ${value.from}`)
              if (value.to) parts.push(`até ${value.to}`)
              if (value.min !== undefined) parts.push(`mín ${value.min}`)
              if (value.max !== undefined) parts.push(`máx ${value.max}`)
              return (
                <FilterChip
                  key={key}
                  label={filter.label}
                  value={parts.join(' ')}
                  onRemove={() => handleFilterChange(key, undefined)}
                />
              )
            }

            return null
          })}
        </div>
      )}

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50 border-b">
                {displayColumns.map((col) => (
                  <th
                    key={col.key}
                    className={`text-left py-3 px-4 font-medium text-sm ${col.className || ''}`}
                    style={{ width: col.width }}
                  >
                    {col.sortable ? (
                      <button
                        onClick={() => handleSort(col.key)}
                        className="inline-flex items-center gap-1 hover:text-foreground text-muted-foreground"
                      >
                        {col.header}
                        {sortKey === col.key ? (
                          sortOrder === 'asc' ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          )
                        ) : (
                          <ArrowUpDown className="h-4 w-4 opacity-50" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                ))}
                {actions && (
                  <th className="text-right py-3 px-4 font-medium text-sm w-24">Ações</th>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                // Skeleton rows for loading state
                Array.from({ length: 5 }).map((_, rowIndex) => (
                  <tr key={`skeleton-${rowIndex}`} className="border-b">
                    {displayColumns.map((_, colIndex) => (
                      <td key={`skeleton-${rowIndex}-${colIndex}`} className="py-4 px-4">
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-3/4" />
                          {colIndex === 0 && <Skeleton className="h-3 w-1/2" />}
                        </div>
                      </td>
                    ))}
                    {actions && (
                      <td className="py-4 px-4">
                        <Skeleton className="h-8 w-20 ml-auto" />
                      </td>
                    )}
                  </tr>
                ))
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td
                    colSpan={displayColumns.length + (actions ? 1 : 0)}
                    className="py-12 text-center"
                  >
                    {emptyState || (
                      <div className="text-muted-foreground">
                        <p className="font-medium">Nenhum resultado encontrado</p>
                        {activeFilterCount > 0 && (
                          <p className="text-sm mt-1">
                            Tente ajustar os filtros ou{' '}
                            <button
                              onClick={clearAllFilters}
                              className="text-primary hover:underline"
                            >
                              limpar todos
                            </button>
                          </p>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedData.map((item) => (
                  <tr
                    key={keyExtractor(item)}
                    onClick={() => onRowClick?.(item)}
                    className={`border-b last:border-0 hover:bg-muted/50 transition-colors ${
                      onRowClick ? 'cursor-pointer' : ''
                    }`}
                  >
                    {displayColumns.map((col) => (
                      <td key={col.key} className={`py-4 px-4 ${col.className || ''}`}>
                        {col.render ? col.render(item) : item[col.key]}
                      </td>
                    ))}
                    {actions && (
                      <td className="py-4 px-4 text-right">{actions(item)}</td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {!loading && filteredData.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredData.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => {
            setPageSize(size)
            setCurrentPage(1)
          }}
        />
      )}
    </div>
  )
}
