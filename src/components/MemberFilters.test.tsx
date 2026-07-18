import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemberFilters, DEFAULT_FILTERS, countActiveFilters, type MemberFiltersState } from './MemberFilters'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('lucide-react', () => {
  const icon = (name: string) => {
    const Comp = (props: Record<string, unknown>) => <span data-testid={`icon-${name}`} {...props} />
    Comp.displayName = name
    return Comp
  }
  return {
    Search: icon('Search'),
    Filter: icon('Filter'),
    X: icon('X'),
    Calendar: icon('Calendar'),
    Star: icon('Star'),
    Crown: icon('Crown'),
    Sparkles: icon('Sparkles'),
    ChevronDown: icon('ChevronDown'),
    ChevronUp: icon('ChevronUp'),
    RotateCcw: icon('RotateCcw'),
  }
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MemberFilters', () => {
  const onChange = vi.fn()
  const onReset = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  function renderFilters(overrides?: Partial<MemberFiltersState>, activeCount = 0) {
    const filters = { ...DEFAULT_FILTERS, ...overrides }
    return render(
      <MemberFilters
        filters={filters}
        onChange={onChange}
        onReset={onReset}
        activeFiltersCount={activeCount}
      />
    )
  }

  // ---------- Rendering ----------
  it('should render search input', () => {
    renderFilters()
    expect(screen.getByPlaceholderText('Buscar por nome, CPF ou email...')).toBeInTheDocument()
  })

  it('should render Filtros button', () => {
    renderFilters()
    expect(screen.getByText('Filtros')).toBeInTheDocument()
  })

  it('should render status filter buttons', () => {
    renderFilters()
    expect(screen.getByText('Ativo')).toBeInTheDocument()
    expect(screen.getByText('Pendente')).toBeInTheDocument()
    expect(screen.getByText('Inativo')).toBeInTheDocument()
    expect(screen.getByText('Expirado')).toBeInTheDocument()
  })

  it('should NOT render plan filter buttons (single plan)', () => {
    renderFilters()
    expect(screen.queryByText('Silver')).not.toBeInTheDocument()
    expect(screen.queryByText('Gold')).not.toBeInTheDocument()
    expect(screen.queryByText('Black')).not.toBeInTheDocument()
  })

  it('should show status label but no plan label', () => {
    renderFilters()
    expect(screen.getByText('Status:')).toBeInTheDocument()
    expect(screen.queryByText('Planos:')).not.toBeInTheDocument()
  })

  // ---------- Search ----------
  it('should call onChange when search input changes', () => {
    renderFilters()
    const input = screen.getByPlaceholderText('Buscar por nome, CPF ou email...')
    fireEvent.change(input, { target: { value: 'Joao' } })

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      search: 'Joao',
    }))
  })

  it('should show clear button when search has value', () => {
    renderFilters({ search: 'test' })
    // X icon button should be present
    expect(screen.getByTestId('icon-X')).toBeInTheDocument()
  })

  it('should not show clear button when search is empty', () => {
    renderFilters({ search: '' })
    // No X icon should be visible (only in the lucide mock)
    const xIcons = screen.queryAllByTestId('icon-X')
    expect(xIcons).toHaveLength(0)
  })

  it('should clear search when X is clicked', () => {
    renderFilters({ search: 'test' })
    const clearBtn = screen.getByTestId('icon-X').closest('button')!
    fireEvent.click(clearBtn)

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      search: '',
    }))
  })

  // ---------- Status filters ----------
  it('should toggle status filter on click', () => {
    renderFilters()
    fireEvent.click(screen.getByText('Ativo'))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      status: ['active'],
    }))
  })

  it('should remove status filter on second click', () => {
    renderFilters({ status: ['active'] })
    fireEvent.click(screen.getByText('Ativo'))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      status: [],
    }))
  })

  it('should add multiple status filters', () => {
    renderFilters({ status: ['active'] })
    fireEvent.click(screen.getByText('Pendente'))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      status: ['active', 'pending'],
    }))
  })

  it('should apply active styling to selected status', () => {
    renderFilters({ status: ['active'] })
    const activeBtn = screen.getByText('Ativo').closest('button')!
    expect(activeBtn.className).toContain('bg-primary')
  })

  // ---------- Advanced filters ----------
  it('should not show advanced filters by default', () => {
    renderFilters()
    expect(screen.queryByText('Validade (de)')).not.toBeInTheDocument()
  })

  it('should show advanced filters when Filtros button clicked', () => {
    renderFilters()
    fireEvent.click(screen.getByText('Filtros'))

    expect(screen.getByText('Validade (de)')).toBeInTheDocument()
    expect(screen.getByText('Validade (até)')).toBeInTheDocument()
    expect(screen.getByText('Cadastro (de)')).toBeInTheDocument()
    expect(screen.getByText('Cadastro (até)')).toBeInTheDocument()
    expect(screen.getByText('Ordenar por')).toBeInTheDocument()
    expect(screen.getByText('Ordem')).toBeInTheDocument()
    // Sem filtros de pontos (não há mais programa de pontos)
    expect(screen.queryByText('Pontos (mínimo)')).not.toBeInTheDocument()
    expect(screen.queryByText('Pontos (máximo)')).not.toBeInTheDocument()
  })

  it('should hide advanced filters when Filtros button clicked again', () => {
    renderFilters()
    fireEvent.click(screen.getByText('Filtros'))
    expect(screen.getByText('Validade (de)')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Filtros'))
    expect(screen.queryByText('Validade (de)')).not.toBeInTheDocument()
  })

  it('should update expiryFrom when date input changes', () => {
    renderFilters()
    fireEvent.click(screen.getByText('Filtros'))

    const inputs = screen.getAllByDisplayValue('')
    // Find the expiryFrom date input (first date input)
    const expiryFrom = inputs.find(i => i.getAttribute('type') === 'date')!
    fireEvent.change(expiryFrom, { target: { value: '2025-06-01' } })

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      expiryFrom: '2025-06-01',
    }))
  })

  it('should update sortBy when select changes', () => {
    renderFilters()
    fireEvent.click(screen.getByText('Filtros'))

    const sortBySelect = screen.getByDisplayValue('Nome')
    fireEvent.change(sortBySelect, { target: { value: 'expiry' } })

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      sortBy: 'expiry',
    }))
  })

  it('should update sortOrder when select changes', () => {
    renderFilters()
    fireEvent.click(screen.getByText('Filtros'))

    const sortOrderSelect = screen.getByDisplayValue('Crescente (A-Z, menor primeiro)')
    fireEvent.change(sortOrderSelect, { target: { value: 'desc' } })

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      sortOrder: 'desc',
    }))
  })

  // ---------- Sort options ----------
  it('should have correct sort options (no points sort)', () => {
    renderFilters()
    fireEvent.click(screen.getByText('Filtros'))

    expect(screen.getByText('Nome')).toBeInTheDocument()
    expect(screen.getByText('Validade')).toBeInTheDocument()
    expect(screen.getByText('Data de Cadastro')).toBeInTheDocument()
    expect(screen.queryByText('Pontos')).not.toBeInTheDocument()
  })

  // ---------- Reset ----------
  it('should show Limpar button when active filters exist', () => {
    renderFilters({}, 3)
    expect(screen.getByText('Limpar')).toBeInTheDocument()
  })

  it('should not show Limpar button when no active filters', () => {
    renderFilters({}, 0)
    expect(screen.queryByText('Limpar')).not.toBeInTheDocument()
  })

  it('should call onReset when Limpar is clicked', () => {
    renderFilters({}, 2)
    fireEvent.click(screen.getByText('Limpar'))
    expect(onReset).toHaveBeenCalled()
  })

  it('should show active filter count badge', () => {
    renderFilters({}, 5)
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('should not show badge when count is 0', () => {
    renderFilters({}, 0)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
})

// ---------- countActiveFilters ----------
describe('countActiveFilters', () => {
  it('should return 0 for default filters', () => {
    expect(countActiveFilters(DEFAULT_FILTERS)).toBe(0)
  })

  it('should count search as 1 filter', () => {
    expect(countActiveFilters({ ...DEFAULT_FILTERS, search: 'test' })).toBe(1)
  })

  it('should count status array as 1 filter', () => {
    expect(countActiveFilters({ ...DEFAULT_FILTERS, status: ['active', 'pending'] })).toBe(1)
  })

  it('should count plans array as 1 filter', () => {
    expect(countActiveFilters({ ...DEFAULT_FILTERS, plans: ['gold'] })).toBe(1)
  })

  it('should count each date field separately', () => {
    const filters = {
      ...DEFAULT_FILTERS,
      expiryFrom: '2025-01-01',
      expiryTo: '2025-12-31',
    }
    expect(countActiveFilters(filters)).toBe(2)
  })

  it('should count each points field separately', () => {
    const filters = {
      ...DEFAULT_FILTERS,
      pointsMin: '100',
      pointsMax: '500',
    }
    expect(countActiveFilters(filters)).toBe(2)
  })

  it('should count created date fields', () => {
    const filters = {
      ...DEFAULT_FILTERS,
      createdFrom: '2025-01-01',
      createdTo: '2025-12-31',
    }
    expect(countActiveFilters(filters)).toBe(2)
  })

  it('should count non-default sort as 1', () => {
    expect(countActiveFilters({ ...DEFAULT_FILTERS, sortBy: 'points' })).toBe(1)
    expect(countActiveFilters({ ...DEFAULT_FILTERS, sortOrder: 'desc' })).toBe(1)
  })

  it('should not double-count sort when both sortBy and sortOrder differ', () => {
    expect(countActiveFilters({ ...DEFAULT_FILTERS, sortBy: 'points', sortOrder: 'desc' })).toBe(1)
  })

  it('should count all filters combined', () => {
    const filters: MemberFiltersState = {
      search: 'test',
      status: ['active'],
      plans: ['gold'],
      expiryFrom: '2025-01-01',
      expiryTo: '2025-12-31',
      pointsMin: '0',
      pointsMax: '100',
      createdFrom: '2024-01-01',
      createdTo: '2024-12-31',
      sortBy: 'points',
      sortOrder: 'desc',
    }
    // search(1) + status(1) + plans(1) + expiryFrom(1) + expiryTo(1)
    // + pointsMin(1) + pointsMax(1) + createdFrom(1) + createdTo(1) + sort(1)
    expect(countActiveFilters(filters)).toBe(10)
  })
})

// ---------- DEFAULT_FILTERS ----------
describe('DEFAULT_FILTERS', () => {
  it('should have expected default values', () => {
    expect(DEFAULT_FILTERS.search).toBe('')
    expect(DEFAULT_FILTERS.status).toEqual([])
    expect(DEFAULT_FILTERS.plans).toEqual([])
    expect(DEFAULT_FILTERS.expiryFrom).toBe('')
    expect(DEFAULT_FILTERS.expiryTo).toBe('')
    expect(DEFAULT_FILTERS.pointsMin).toBe('')
    expect(DEFAULT_FILTERS.pointsMax).toBe('')
    expect(DEFAULT_FILTERS.createdFrom).toBe('')
    expect(DEFAULT_FILTERS.createdTo).toBe('')
    expect(DEFAULT_FILTERS.sortBy).toBe('name')
    expect(DEFAULT_FILTERS.sortOrder).toBe('asc')
  })
})
