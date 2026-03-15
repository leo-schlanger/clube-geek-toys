/**
 * useUrlFilters - Sincroniza filtros com query params da URL
 *
 * Permite compartilhar links com filtros aplicados e
 * manter filtros após refresh da página.
 *
 * @example
 * const { filters, setFilters, resetFilters } = useUrlFilters(DEFAULT_FILTERS)
 * // URL: /admin?search=joao&status=active,pending&sortBy=name
 */

import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { MemberFiltersState } from '../components/MemberFilters'

/**
 * Converte filtros para query params
 * @param filters - Estado dos filtros
 * @returns URLSearchParams com os filtros não-vazios
 */
function filtersToParams(filters: MemberFiltersState): URLSearchParams {
  const params = new URLSearchParams()

  if (filters.search) params.set('search', filters.search)
  if (filters.status.length) params.set('status', filters.status.join(','))
  if (filters.plans.length) params.set('plans', filters.plans.join(','))
  if (filters.expiryFrom) params.set('expiryFrom', filters.expiryFrom)
  if (filters.expiryTo) params.set('expiryTo', filters.expiryTo)
  if (filters.pointsMin) params.set('pointsMin', filters.pointsMin)
  if (filters.pointsMax) params.set('pointsMax', filters.pointsMax)
  if (filters.createdFrom) params.set('createdFrom', filters.createdFrom)
  if (filters.createdTo) params.set('createdTo', filters.createdTo)
  if (filters.sortBy !== 'name') params.set('sortBy', filters.sortBy)
  if (filters.sortOrder !== 'asc') params.set('sortOrder', filters.sortOrder)

  return params
}

/**
 * Converte query params para filtros
 * @param params - URLSearchParams
 * @param defaults - Valores padrão dos filtros
 * @returns Estado dos filtros
 */
function paramsToFilters(
  params: URLSearchParams,
  defaults: MemberFiltersState
): MemberFiltersState {
  return {
    search: params.get('search') || defaults.search,
    status: params.get('status')?.split(',').filter(Boolean) || defaults.status,
    plans: (params.get('plans')?.split(',').filter(Boolean) || defaults.plans) as MemberFiltersState['plans'],
    expiryFrom: params.get('expiryFrom') || defaults.expiryFrom,
    expiryTo: params.get('expiryTo') || defaults.expiryTo,
    pointsMin: params.get('pointsMin') || defaults.pointsMin,
    pointsMax: params.get('pointsMax') || defaults.pointsMax,
    createdFrom: params.get('createdFrom') || defaults.createdFrom,
    createdTo: params.get('createdTo') || defaults.createdTo,
    sortBy: (params.get('sortBy') as MemberFiltersState['sortBy']) || defaults.sortBy,
    sortOrder: (params.get('sortOrder') as MemberFiltersState['sortOrder']) || defaults.sortOrder,
  }
}

interface UseUrlFiltersReturn {
  filters: MemberFiltersState
  setFilters: (filters: MemberFiltersState) => void
  resetFilters: () => void
  activeFiltersCount: number
}

/**
 * Hook para sincronizar filtros com URL
 * @param defaultFilters - Valores padrão dos filtros
 * @returns Objeto com filtros, setters e contador de filtros ativos
 */
export function useUrlFilters(defaultFilters: MemberFiltersState): UseUrlFiltersReturn {
  const [searchParams, setSearchParams] = useSearchParams()

  // Converter params para filtros
  const filters = useMemo(
    () => paramsToFilters(searchParams, defaultFilters),
    [searchParams, defaultFilters]
  )

  // Atualizar URL quando filtros mudam
  const setFilters = useCallback(
    (newFilters: MemberFiltersState) => {
      const params = filtersToParams(newFilters)
      setSearchParams(params, { replace: true })
    },
    [setSearchParams]
  )

  // Resetar filtros
  const resetFilters = useCallback(() => {
    setSearchParams({}, { replace: true })
  }, [setSearchParams])

  // Contar filtros ativos (excluindo valores padrão)
  const activeFiltersCount = useMemo(() => {
    let count = 0
    if (filters.search) count++
    if (filters.status.length) count++
    if (filters.plans.length) count++
    if (filters.expiryFrom || filters.expiryTo) count++
    if (filters.pointsMin || filters.pointsMax) count++
    if (filters.createdFrom || filters.createdTo) count++
    if (filters.sortBy !== defaultFilters.sortBy) count++
    if (filters.sortOrder !== defaultFilters.sortOrder) count++
    return count
  }, [filters, defaultFilters])

  return {
    filters,
    setFilters,
    resetFilters,
    activeFiltersCount,
  }
}
