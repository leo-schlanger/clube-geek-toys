/**
 * Keeps filters in the URL query string, so a filtered view can be shared and
 * survives a refresh.
 *
 * @example
 * const { filters, setFilters, resetFilters } = useUrlFilters(DEFAULT_FILTERS)
 * // URL: /admin?search=joao&status=active,pending&sortBy=name
 */

import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { MemberFiltersState } from '../components/MemberFilters'

/** Non-empty filters only; empty ones stay out of the URL. */
function filtersToParams(filters: MemberFiltersState): URLSearchParams {
  const params = new URLSearchParams()

  if (filters.search) params.set('search', filters.search)
  if (filters.status.length) params.set('status', filters.status.join(','))
  if (filters.plans.length) params.set('plans', filters.plans.join(','))
  if (filters.expiryFrom) params.set('expiryFrom', filters.expiryFrom)
  if (filters.expiryTo) params.set('expiryTo', filters.expiryTo)
  if (filters.createdFrom) params.set('createdFrom', filters.createdFrom)
  if (filters.createdTo) params.set('createdTo', filters.createdTo)
  if (filters.sortBy !== 'name') params.set('sortBy', filters.sortBy)
  if (filters.sortOrder !== 'asc') params.set('sortOrder', filters.sortOrder)

  return params
}

/**
 * @param params - URLSearchParams
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


export function useUrlFilters(defaultFilters: MemberFiltersState): UseUrlFiltersReturn {
  const [searchParams, setSearchParams] = useSearchParams()


  const filters = useMemo(
    () => paramsToFilters(searchParams, defaultFilters),
    [searchParams, defaultFilters]
  )


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

  // Active means different from the default
  const activeFiltersCount = useMemo(() => {
    let count = 0
    if (filters.search) count++
    if (filters.status.length) count++
    if (filters.plans.length) count++
    if (filters.expiryFrom || filters.expiryTo) count++
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
