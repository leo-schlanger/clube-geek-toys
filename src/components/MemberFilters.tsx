import { useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import {
  Search,
  Filter,
  X,
  Calendar,
  Star,
  Crown,
  Sparkles,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from 'lucide-react'
import type { PlanType } from '../types'

export interface MemberFiltersState {
  search: string
  status: string[]
  plans: PlanType[]
  expiryFrom: string
  expiryTo: string
  pointsMin: string
  pointsMax: string
  createdFrom: string
  createdTo: string
  sortBy: 'name' | 'points' | 'expiry' | 'created'
  sortOrder: 'asc' | 'desc'
}

interface MemberFiltersProps {
  filters: MemberFiltersState
  onChange: (filters: MemberFiltersState) => void
  onReset: () => void
  activeFiltersCount: number
}

const STATUS_OPTIONS = [
  { value: 'active', label: 'Ativo', color: 'bg-green-500' },
  { value: 'pending', label: 'Pendente', color: 'bg-yellow-500' },
  { value: 'inactive', label: 'Inativo', color: 'bg-gray-500' },
  { value: 'expired', label: 'Expirado', color: 'bg-red-500' },
]

const PLAN_OPTIONS: { value: PlanType; label: string; icon: React.ReactNode }[] = [
  { value: 'silver', label: 'Silver', icon: <Star className="h-4 w-4" /> },
  { value: 'gold', label: 'Gold', icon: <Crown className="h-4 w-4" /> },
  { value: 'black', label: 'Black', icon: <Sparkles className="h-4 w-4" /> },
]

const SORT_OPTIONS = [
  { value: 'name', label: 'Nome' },
  { value: 'points', label: 'Pontos' },
  { value: 'expiry', label: 'Validade' },
  { value: 'created', label: 'Data de Cadastro' },
]

export const DEFAULT_FILTERS: MemberFiltersState = {
  search: '',
  status: [],
  plans: [],
  expiryFrom: '',
  expiryTo: '',
  pointsMin: '',
  pointsMax: '',
  createdFrom: '',
  createdTo: '',
  sortBy: 'name',
  sortOrder: 'asc',
}

export function MemberFilters({ filters, onChange, onReset, activeFiltersCount }: MemberFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  const updateFilter = <K extends keyof MemberFiltersState>(
    key: K,
    value: MemberFiltersState[K]
  ) => {
    onChange({ ...filters, [key]: value })
  }

  const toggleArrayFilter = <K extends 'status' | 'plans'>(
    key: K,
    value: MemberFiltersState[K][number]
  ) => {
    const current = filters[key] as string[]
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value]
    onChange({ ...filters, [key]: updated })
  }

  return (
    <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
      {/* Search and quick filters row */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, CPF ou email..."
            value={filters.search}
            onChange={(e) => updateFilter('search', e.target.value)}
            className="pl-10"
          />
          {filters.search && (
            <button
              onClick={() => updateFilter('search', '')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Advanced toggle and reset */}
        <div className="flex gap-2">
          <Button
            variant={showAdvanced ? 'default' : 'outline'}
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="gap-2"
          >
            <Filter className="h-4 w-4" />
            Filtros
            {activeFiltersCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center">
                {activeFiltersCount}
              </Badge>
            )}
            {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>

          {activeFiltersCount > 0 && (
            <Button variant="ghost" onClick={onReset} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Limpar
            </Button>
          )}
        </div>
      </div>

      {/* Quick status filters */}
      <div className="flex flex-wrap gap-2">
        <span className="text-sm text-muted-foreground self-center mr-2">Status:</span>
        {STATUS_OPTIONS.map((status) => (
          <button
            key={status.value}
            onClick={() => toggleArrayFilter('status', status.value)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filters.status.includes(status.value)
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80 text-foreground'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${status.color}`} />
            {status.label}
          </button>
        ))}
      </div>

      {/* Quick plan filters */}
      <div className="flex flex-wrap gap-2">
        <span className="text-sm text-muted-foreground self-center mr-2">Planos:</span>
        {PLAN_OPTIONS.map((plan) => (
          <button
            key={plan.value}
            onClick={() => toggleArrayFilter('plans', plan.value)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filters.plans.includes(plan.value)
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80 text-foreground'
            }`}
          >
            {plan.icon}
            {plan.label}
          </button>
        ))}
      </div>

      {/* Advanced filters */}
      {showAdvanced && (
        <div className="pt-4 border-t space-y-4 animate-in fade-in slide-in-from-top-2">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Expiry date range */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Validade (de)
              </label>
              <Input
                type="date"
                value={filters.expiryFrom}
                onChange={(e) => updateFilter('expiryFrom', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Validade (até)
              </label>
              <Input
                type="date"
                value={filters.expiryTo}
                onChange={(e) => updateFilter('expiryTo', e.target.value)}
              />
            </div>

            {/* Points range */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Pontos (mínimo)</label>
              <Input
                type="number"
                placeholder="0"
                value={filters.pointsMin}
                onChange={(e) => updateFilter('pointsMin', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Pontos (máximo)</label>
              <Input
                type="number"
                placeholder="Sem limite"
                value={filters.pointsMax}
                onChange={(e) => updateFilter('pointsMax', e.target.value)}
              />
            </div>

            {/* Created date range */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Cadastro (de)
              </label>
              <Input
                type="date"
                value={filters.createdFrom}
                onChange={(e) => updateFilter('createdFrom', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Cadastro (até)
              </label>
              <Input
                type="date"
                value={filters.createdTo}
                onChange={(e) => updateFilter('createdTo', e.target.value)}
              />
            </div>

            {/* Sort */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Ordenar por</label>
              <select
                value={filters.sortBy}
                onChange={(e) => updateFilter('sortBy', e.target.value as MemberFiltersState['sortBy'])}
                className="w-full px-3 py-2 rounded-md border bg-background text-sm"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Ordem</label>
              <select
                value={filters.sortOrder}
                onChange={(e) => updateFilter('sortOrder', e.target.value as 'asc' | 'desc')}
                className="w-full px-3 py-2 rounded-md border bg-background text-sm"
              >
                <option value="asc">Crescente (A-Z, menor primeiro)</option>
                <option value="desc">Decrescente (Z-A, maior primeiro)</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Count active filters (excluding defaults)
 */
export function countActiveFilters(filters: MemberFiltersState): number {
  let count = 0
  if (filters.search) count++
  if (filters.status.length > 0) count++
  if (filters.plans.length > 0) count++
  if (filters.expiryFrom) count++
  if (filters.expiryTo) count++
  if (filters.pointsMin) count++
  if (filters.pointsMax) count++
  if (filters.createdFrom) count++
  if (filters.createdTo) count++
  if (filters.sortBy !== 'name' || filters.sortOrder !== 'asc') count++
  return count
}
