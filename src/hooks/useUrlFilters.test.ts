import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUrlFilters } from './useUrlFilters'
import type { MemberFiltersState } from '../components/MemberFilters'

// Mock react-router-dom useSearchParams
const mockSetSearchParams = vi.fn()
let currentParams = new URLSearchParams()

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [currentParams, mockSetSearchParams] as const,
}))

const defaultFilters: MemberFiltersState = {
  search: '',
  status: [],
  plans: [],
  expiryFrom: '',
  expiryTo: '',
  createdFrom: '',
  createdTo: '',
  sortBy: 'name',
  sortOrder: 'asc',
}

describe('useUrlFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentParams = new URLSearchParams()
  })

  it('should return default filters when URL has no params', () => {
    const { result } = renderHook(() => useUrlFilters(defaultFilters))

    expect(result.current.filters).toEqual(defaultFilters)
    expect(result.current.activeFiltersCount).toBe(0)
  })

  it('should parse search param from URL', () => {
    currentParams = new URLSearchParams('search=joao')

    const { result } = renderHook(() => useUrlFilters(defaultFilters))

    expect(result.current.filters.search).toBe('joao')
    expect(result.current.activeFiltersCount).toBe(1)
  })

  it('should parse status as comma-separated array', () => {
    currentParams = new URLSearchParams('status=active,pending')

    const { result } = renderHook(() => useUrlFilters(defaultFilters))

    expect(result.current.filters.status).toEqual(['active', 'pending'])
    expect(result.current.activeFiltersCount).toBe(1)
  })

  it('should parse plans as comma-separated array', () => {
    currentParams = new URLSearchParams('plans=silver,gold')

    const { result } = renderHook(() => useUrlFilters(defaultFilters))

    expect(result.current.filters.plans).toEqual(['silver', 'gold'])
    expect(result.current.activeFiltersCount).toBe(1)
  })

  it('should parse date range filters', () => {
    currentParams = new URLSearchParams('expiryFrom=2026-01-01&expiryTo=2026-06-30')

    const { result } = renderHook(() => useUrlFilters(defaultFilters))

    expect(result.current.filters.expiryFrom).toBe('2026-01-01')
    expect(result.current.filters.expiryTo).toBe('2026-06-30')
    expect(result.current.activeFiltersCount).toBe(1) // Expiry range counts as one
  })

  it('should parse sortBy and sortOrder', () => {
    currentParams = new URLSearchParams('sortBy=expiry&sortOrder=desc')

    const { result } = renderHook(() => useUrlFilters(defaultFilters))

    expect(result.current.filters.sortBy).toBe('expiry')
    expect(result.current.filters.sortOrder).toBe('desc')
    expect(result.current.activeFiltersCount).toBe(2) // sortBy and sortOrder each count
  })

  it('should not count default sortBy/sortOrder as active filters', () => {
    currentParams = new URLSearchParams('sortBy=name&sortOrder=asc')

    const { result } = renderHook(() => useUrlFilters(defaultFilters))

    expect(result.current.activeFiltersCount).toBe(0)
  })

  it('should count multiple active filters', () => {
    currentParams = new URLSearchParams('search=test&status=active&plans=gold&sortBy=expiry')

    const { result } = renderHook(() => useUrlFilters(defaultFilters))

    // search(1) + status(1) + plans(1) + sortBy(1) = 4
    expect(result.current.activeFiltersCount).toBe(4)
  })

  it('setFilters should call setSearchParams with serialized params', () => {
    const { result } = renderHook(() => useUrlFilters(defaultFilters))

    act(() => {
      result.current.setFilters({
        ...defaultFilters,
        search: 'test',
        status: ['active'],
        sortBy: 'expiry',
      })
    })

    expect(mockSetSearchParams).toHaveBeenCalledTimes(1)

    const calledParams = mockSetSearchParams.mock.calls[0][0] as URLSearchParams
    expect(calledParams.get('search')).toBe('test')
    expect(calledParams.get('status')).toBe('active')
    expect(calledParams.get('sortBy')).toBe('expiry')
    // Default values should not be set
    expect(calledParams.has('sortOrder')).toBe(false)
  })

  it('setFilters should not include empty/default values in params', () => {
    const { result } = renderHook(() => useUrlFilters(defaultFilters))

    act(() => {
      result.current.setFilters(defaultFilters)
    })

    const calledParams = mockSetSearchParams.mock.calls[0][0] as URLSearchParams
    expect(calledParams.toString()).toBe('')
  })

  it('setFilters should include sortBy=name as default (not set)', () => {
    const { result } = renderHook(() => useUrlFilters(defaultFilters))

    act(() => {
      result.current.setFilters({ ...defaultFilters, sortBy: 'name' })
    })

    const calledParams = mockSetSearchParams.mock.calls[0][0] as URLSearchParams
    expect(calledParams.has('sortBy')).toBe(false)
  })

  it('setFilters should pass replace: true option', () => {
    const { result } = renderHook(() => useUrlFilters(defaultFilters))

    act(() => {
      result.current.setFilters(defaultFilters)
    })

    expect(mockSetSearchParams).toHaveBeenCalledWith(expect.anything(), { replace: true })
  })

  it('resetFilters should clear all URL params', () => {
    currentParams = new URLSearchParams('search=test&status=active')

    const { result } = renderHook(() => useUrlFilters(defaultFilters))

    act(() => {
      result.current.resetFilters()
    })

    expect(mockSetSearchParams).toHaveBeenCalledWith({}, { replace: true })
  })

  it('should parse createdFrom and createdTo', () => {
    currentParams = new URLSearchParams('createdFrom=2026-01-01&createdTo=2026-12-31')

    const { result } = renderHook(() => useUrlFilters(defaultFilters))

    expect(result.current.filters.createdFrom).toBe('2026-01-01')
    expect(result.current.filters.createdTo).toBe('2026-12-31')
    expect(result.current.activeFiltersCount).toBe(1) // created range counts as one
  })

  it('should handle partial expiry range (only from)', () => {
    currentParams = new URLSearchParams('expiryFrom=2026-01-01')

    const { result } = renderHook(() => useUrlFilters(defaultFilters))

    expect(result.current.filters.expiryFrom).toBe('2026-01-01')
    expect(result.current.filters.expiryTo).toBe('')
    expect(result.current.activeFiltersCount).toBe(1)
  })

  it('should filter out empty strings in status split', () => {
    currentParams = new URLSearchParams('status=active,,pending,')

    const { result } = renderHook(() => useUrlFilters(defaultFilters))

    expect(result.current.filters.status).toEqual(['active', 'pending'])
  })
})
