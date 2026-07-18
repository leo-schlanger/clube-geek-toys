/**
 * DataTable Component Tests
 *
 * Covers: rendering, search, sorting, pagination, filters,
 * column visibility, empty state, loading skeleton, export, and row clicks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataTable, type Column, type FilterConfig } from './DataTable'

// ── Test helpers ──────────────────────────────────────────────

interface TestRow {
  id: string
  name: string
  status: string
  age: number
  date: string
}

const sampleData: TestRow[] = [
  { id: '1', name: 'Alice', status: 'active', age: 30, date: '2024-01-01' },
  { id: '2', name: 'Bob', status: 'pending', age: 25, date: '2024-06-15' },
  { id: '3', name: 'Carlos', status: 'inactive', age: 40, date: '2023-12-01' },
  { id: '4', name: 'Diana', status: 'active', age: 35, date: '2024-03-10' },
  { id: '5', name: 'Eduardo', status: 'active', age: 22, date: '2024-08-20' },
]

const columns: Column<TestRow>[] = [
  { key: 'name', header: 'Nome', sortable: true },
  { key: 'status', header: 'Status', sortable: true },
  { key: 'age', header: 'Idade', sortable: true },
  { key: 'date', header: 'Data' },
]

const defaultProps = {
  data: sampleData,
  columns,
  keyExtractor: (item: TestRow) => item.id,
  searchKeys: ['name'] as string[],
}

// ── Tests ─────────────────────────────────────────────────────

describe('DataTable', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // ── Rendering ───────────────────────────────────────────────

  describe('rendering', () => {
    it('renders column headers', () => {
      render(<DataTable {...defaultProps} />)
      expect(screen.getByText('Nome')).toBeInTheDocument()
      expect(screen.getByText('Status')).toBeInTheDocument()
      expect(screen.getByText('Idade')).toBeInTheDocument()
      expect(screen.getByText('Data')).toBeInTheDocument()
    })

    it('renders all rows within the first page', () => {
      render(<DataTable {...defaultProps} />)
      expect(screen.getByText('Alice')).toBeInTheDocument()
      expect(screen.getByText('Bob')).toBeInTheDocument()
      expect(screen.getByText('Carlos')).toBeInTheDocument()
      expect(screen.getByText('Diana')).toBeInTheDocument()
      expect(screen.getByText('Eduardo')).toBeInTheDocument()
    })

    it('renders custom cell via render function', () => {
      const customColumns: Column<TestRow>[] = [
        {
          key: 'name',
          header: 'Nome',
          render: (item) => <span data-testid={`custom-${item.id}`}>{item.name.toUpperCase()}</span>,
        },
      ]
      render(<DataTable {...defaultProps} columns={customColumns} />)
      expect(screen.getByTestId('custom-1')).toHaveTextContent('ALICE')
    })

    it('renders actions column when actions prop provided', () => {
      render(
        <DataTable
          {...defaultProps}
          actions={(item) => <button data-testid={`action-${item.id}`}>Edit</button>}
        />
      )
      expect(screen.getByText('Ações')).toBeInTheDocument()
      expect(screen.getByTestId('action-1')).toBeInTheDocument()
    })

    it('does not render actions column header when no actions', () => {
      render(<DataTable {...defaultProps} />)
      expect(screen.queryByText('Ações')).not.toBeInTheDocument()
    })
  })

  // ── Search ──────────────────────────────────────────────────

  describe('search', () => {
    it('renders search input with placeholder', () => {
      render(<DataTable {...defaultProps} searchPlaceholder="Buscar membros..." />)
      expect(screen.getByPlaceholderText('Buscar membros...')).toBeInTheDocument()
    })

    it('filters rows by search input', async () => {
      const user = userEvent.setup()
      render(<DataTable {...defaultProps} />)

      const searchInput = screen.getByPlaceholderText('Buscar...')
      await user.type(searchInput, 'Alice')

      // Alice appears in both the table row and the filter chip — use table scope
      const table = screen.getByRole('table')
      expect(within(table).getByText('Alice')).toBeInTheDocument()
      expect(within(table).queryByText('Bob')).not.toBeInTheDocument()
    })

    it('shows clear button when search has value', async () => {
      const user = userEvent.setup()
      render(<DataTable {...defaultProps} />)

      const searchInput = screen.getByPlaceholderText('Buscar...')
      await user.type(searchInput, 'test')

      const clearBtn = screen.getByLabelText('Limpar busca')
      expect(clearBtn).toBeInTheDocument()
    })

    it('clears search when clear button clicked', async () => {
      const user = userEvent.setup()
      render(<DataTable {...defaultProps} />)

      const searchInput = screen.getByPlaceholderText('Buscar...')
      await user.type(searchInput, 'Alice')

      const table = screen.getByRole('table')
      expect(within(table).queryByText('Bob')).not.toBeInTheDocument()

      const clearBtn = screen.getByLabelText('Limpar busca')
      await user.click(clearBtn)

      expect(within(table).getByText('Bob')).toBeInTheDocument()
    })

    it('search matches numbers when searchKeys include numeric field', async () => {
      const user = userEvent.setup()
      render(<DataTable {...defaultProps} searchKeys={['name', 'age']} />)

      const searchInput = screen.getByPlaceholderText('Buscar...')
      await user.type(searchInput, '40')

      const table = screen.getByRole('table')
      expect(within(table).getByText('Carlos')).toBeInTheDocument()
      expect(within(table).queryByText('Alice')).not.toBeInTheDocument()
    })
  })

  // ── Sorting ─────────────────────────────────────────────────

  describe('sorting', () => {
    it('renders sort buttons for sortable columns', () => {
      render(<DataTable {...defaultProps} />)
      expect(screen.getByLabelText('Ordenar por Nome')).toBeInTheDocument()
      expect(screen.getByLabelText('Ordenar por Status')).toBeInTheDocument()
    })

    it('does not render sort button for non-sortable columns', () => {
      render(<DataTable {...defaultProps} />)
      expect(screen.queryByLabelText('Ordenar por Data')).not.toBeInTheDocument()
    })

    it('sorts ascending on first click', async () => {
      const user = userEvent.setup()
      render(<DataTable {...defaultProps} />)

      const sortBtn = screen.getByLabelText('Ordenar por Nome')
      await user.click(sortBtn)

      const rows = screen.getAllByRole('row')
      // Header row + data rows. First data row should be "Alice"
      const firstDataRow = rows[1]
      expect(within(firstDataRow).getByText('Alice')).toBeInTheDocument()
    })

    it('toggles to descending on second click', async () => {
      const user = userEvent.setup()
      render(<DataTable {...defaultProps} />)

      const sortBtn = screen.getByLabelText('Ordenar por Nome')
      await user.click(sortBtn) // asc
      await user.click(sortBtn) // desc

      const rows = screen.getAllByRole('row')
      const firstDataRow = rows[1]
      expect(within(firstDataRow).getByText('Eduardo')).toBeInTheDocument()
    })
  })

  // ── Loading state ───────────────────────────────────────────

  describe('loading', () => {
    it('shows skeleton rows when loading', () => {
      const { container } = render(<DataTable {...defaultProps} loading={true} />)
      // Data rows shouldn't show
      expect(screen.queryByText('Alice')).not.toBeInTheDocument()
      // Skeleton rows should be present
      const skeletonCells = container.querySelectorAll('.space-y-2')
      expect(skeletonCells.length).toBeGreaterThanOrEqual(5)
    })

    it('does not show pagination when loading', () => {
      const { container } = render(<DataTable {...defaultProps} loading={true} />)
      // The Pagination component is not rendered when loading
      // Check that no page-size select exists
      const selects = container.querySelectorAll('select')
      expect(selects.length).toBe(0)
    })
  })

  // ── Empty state ─────────────────────────────────────────────

  describe('empty state', () => {
    it('shows default empty message when no data', () => {
      render(<DataTable {...defaultProps} data={[]} />)
      expect(screen.getByText('Nenhum resultado encontrado')).toBeInTheDocument()
    })

    it('shows custom empty state when provided', () => {
      render(
        <DataTable
          {...defaultProps}
          data={[]}
          emptyState={<div>Sem dados disponíveis</div>}
        />
      )
      expect(screen.getByText('Sem dados disponíveis')).toBeInTheDocument()
    })

    it('shows "limpar todos" link when filters active and no results', async () => {
      const user = userEvent.setup()
      render(<DataTable {...defaultProps} />)

      const searchInput = screen.getByPlaceholderText('Buscar...')
      await user.type(searchInput, 'nonexistent_name_xyz')

      expect(screen.getByText('limpar todos')).toBeInTheDocument()
    })
  })

  // ── Row click ───────────────────────────────────────────────

  describe('row click', () => {
    it('calls onRowClick when a row is clicked', async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()
      render(<DataTable {...defaultProps} onRowClick={handleClick} />)

      const rows = screen.getAllByRole('row')
      await user.click(rows[1]) // first data row

      expect(handleClick).toHaveBeenCalledTimes(1)
      expect(handleClick).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Alice' })
      )
    })
  })

  // ── Column visibility ──────────────────────────────────────

  describe('column visibility', () => {
    it('opens column picker dropdown', async () => {
      const user = userEvent.setup()
      render(<DataTable {...defaultProps} />)

      const colBtn = screen.getByRole('button', { name: /colunas/i })
      await user.click(colBtn)

      expect(screen.getByText('Colunas visíveis')).toBeInTheDocument()
    })

    it('hides a column when unchecked', async () => {
      const user = userEvent.setup()
      render(<DataTable {...defaultProps} />)

      const colBtn = screen.getByRole('button', { name: /colunas/i })
      await user.click(colBtn)

      // Find the dropdown panel
      const pickerPanel = screen.getByText('Colunas visíveis').closest('div')!

      // Find the checkbox labeled "Idade" within the picker (avoids ambiguity with "Status")
      const idadeLabel = within(pickerPanel).getByText('Idade')
      const idadeCheckbox = idadeLabel.closest('label')?.querySelector('input[type="checkbox"]')
      expect(idadeCheckbox).toBeTruthy()

      await user.click(idadeCheckbox!)

      // "Idade" column header should be gone from the table
      const table = screen.getByRole('table')
      const headers = within(table).getAllByRole('columnheader')
      const headerTexts = headers.map((h) => h.textContent)
      expect(headerTexts.join('|')).not.toContain('Idade')
    })
  })

  // ── Filters ────────────────────────────────────────────────

  describe('filters', () => {
    const filterConfigs: FilterConfig[] = [
      {
        key: 'status',
        label: 'Situação',  // Use a distinct label to avoid conflict with "Status" column header
        type: 'select',
        options: [
          { value: 'active', label: 'Ativo' },
          { value: 'pending', label: 'Pendente' },
          { value: 'inactive', label: 'Inativo' },
        ],
      },
    ]

    it('shows filter toggle button when filters configured', () => {
      render(<DataTable {...defaultProps} filters={filterConfigs} />)
      expect(screen.getByRole('button', { name: /filtros/i })).toBeInTheDocument()
    })

    it('does not show filter button when no filters', () => {
      render(<DataTable {...defaultProps} />)
      expect(screen.queryByRole('button', { name: /filtros/i })).not.toBeInTheDocument()
    })

    it('toggles filter panel visibility', async () => {
      const user = userEvent.setup()
      render(<DataTable {...defaultProps} filters={filterConfigs} />)

      const filterBtn = screen.getByRole('button', { name: /filtros/i })
      await user.click(filterBtn)

      expect(screen.getByText('Situação')).toBeInTheDocument()
      // The native <select> renders as combobox — scope to filter panel to avoid
      // collision with the Pagination page-size <select>
      const filterPanel = screen.getByText('Situação').closest('.space-y-1\\.5')!
      expect(within(filterPanel).getByRole('combobox')).toBeInTheDocument()
    })

    it('applies select filter correctly', async () => {
      const user = userEvent.setup()
      render(<DataTable {...defaultProps} filters={filterConfigs} />)

      // Open filters
      const filterBtn = screen.getByRole('button', { name: /filtros/i })
      await user.click(filterBtn)

      // Scope to the filter panel to get the right <select>
      const filterPanel = screen.getByText('Situação').closest('.space-y-1\\.5')!
      const select = within(filterPanel).getByRole('combobox')
      await user.selectOptions(select, 'pending')

      // Only Bob should remain in the table
      const table = screen.getByRole('table')
      expect(within(table).getByText('Bob')).toBeInTheDocument()
      expect(within(table).queryByText('Alice')).not.toBeInTheDocument()
    })

    it('shows clear filters button when filters active', async () => {
      const user = userEvent.setup()
      render(<DataTable {...defaultProps} filters={filterConfigs} />)

      // Open filters and select one
      await user.click(screen.getByRole('button', { name: /filtros/i }))
      const filterPanel = screen.getByText('Situação').closest('.space-y-1\\.5')!
      await user.selectOptions(within(filterPanel).getByRole('combobox'), 'pending')

      expect(screen.getByRole('button', { name: /limpar filtros/i })).toBeInTheDocument()
    })

    it('clears all filters when clear button clicked', async () => {
      const user = userEvent.setup()
      render(<DataTable {...defaultProps} filters={filterConfigs} />)

      await user.click(screen.getByRole('button', { name: /filtros/i }))
      const filterPanel = screen.getByText('Situação').closest('.space-y-1\\.5')!
      await user.selectOptions(within(filterPanel).getByRole('combobox'), 'pending')

      const table = screen.getByRole('table')
      // Only Bob
      expect(within(table).queryByText('Alice')).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /limpar filtros/i }))

      // All rows restored
      expect(within(table).getByText('Alice')).toBeInTheDocument()
      expect(within(table).getByText('Bob')).toBeInTheDocument()
    })
  })

  // ── Multiselect filters ────────────────────────────────────

  describe('multiselect filters', () => {
    const multiFilterConfigs: FilterConfig[] = [
      {
        key: 'status',
        label: 'Situação',
        type: 'multiselect',
        options: [
          { value: 'active', label: 'Ativo', color: 'bg-green-500' },
          { value: 'pending', label: 'Pendente', color: 'bg-yellow-500' },
          { value: 'inactive', label: 'Inativo', color: 'bg-red-500' },
        ],
      },
    ]

    it('renders multiselect option buttons', async () => {
      const user = userEvent.setup()
      render(<DataTable {...defaultProps} filters={multiFilterConfigs} />)

      await user.click(screen.getByRole('button', { name: /filtros/i }))

      expect(screen.getByText('Ativo')).toBeInTheDocument()
      expect(screen.getByText('Pendente')).toBeInTheDocument()
      expect(screen.getByText('Inativo')).toBeInTheDocument()
    })

    it('filters by clicking multiselect option', async () => {
      const user = userEvent.setup()
      render(<DataTable {...defaultProps} filters={multiFilterConfigs} />)

      await user.click(screen.getByRole('button', { name: /filtros/i }))
      await user.click(screen.getByText('Pendente'))

      const table = screen.getByRole('table')
      expect(within(table).getByText('Bob')).toBeInTheDocument()
      expect(within(table).queryByText('Alice')).not.toBeInTheDocument()
    })
  })

  // ── Export ──────────────────────────────────────────────────

  describe('export', () => {
    it('renders export button when exportData provided', () => {
      const exportFn = vi.fn(() => [['Name'], ['Alice']])
      render(<DataTable {...defaultProps} exportData={exportFn} />)
      expect(screen.getByRole('button', { name: /exportar/i })).toBeInTheDocument()
    })

    it('does not render export button when no exportData', () => {
      render(<DataTable {...defaultProps} />)
      expect(screen.queryByRole('button', { name: /exportar/i })).not.toBeInTheDocument()
    })

    it('calls exportData on click', async () => {
      const user = userEvent.setup()
      const exportFn = vi.fn(() => [['Name'], ['Alice']])

      // Mock URL methods
      const createObjectURL = vi.fn(() => 'blob:test')
      const revokeObjectURL = vi.fn()
      vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })

      // Save original createElement to avoid infinite recursion
      const origCreateElement = document.createElement.bind(document)
      const mockClick = vi.fn()
      vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: ElementCreationOptions) => {
        if (tag === 'a') {
          return { click: mockClick, href: '', download: '' } as unknown as HTMLAnchorElement
        }
        return origCreateElement(tag, options)
      })

      render(<DataTable {...defaultProps} exportData={exportFn} exportFilename="test-export" />)
      await user.click(screen.getByRole('button', { name: /exportar/i }))

      expect(exportFn).toHaveBeenCalled()
    })
  })

  // ── Pagination ─────────────────────────────────────────────

  describe('pagination', () => {
    it('renders pagination when data exceeds page size', () => {
      // Generate 15 items
      const bigData = Array.from({ length: 15 }, (_, i) => ({
        id: `${i}`,
        name: `Person ${i}`,
        status: 'active',
        age: 20 + i,
        date: '2024-01-01',
      }))
      render(<DataTable {...defaultProps} data={bigData} />)
      // Default page size is 10, so first 10 should render
      expect(screen.getByText('Person 0')).toBeInTheDocument()
      expect(screen.getByText('Person 9')).toBeInTheDocument()
      expect(screen.queryByText('Person 10')).not.toBeInTheDocument()
    })
  })

  // ── State change callback ──────────────────────────────────

  describe('onStateChange', () => {
    it('calls onStateChange when search changes', async () => {
      const user = userEvent.setup()
      const handleStateChange = vi.fn()
      render(<DataTable {...defaultProps} onStateChange={handleStateChange} />)

      await user.type(screen.getByPlaceholderText('Buscar...'), 'A')

      expect(handleStateChange).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'A' })
      )
    })
  })
})
