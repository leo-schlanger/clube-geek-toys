/**
 * VirtualTable Component Tests
 *
 * Covers: rendering columns & rows, search filtering, sorting,
 * empty state, loading skeleton, actions column, row click.
 *
 * The @tanstack/react-virtual virtualizer is mocked because jsdom
 * has no layout engine, so scrollElement dimensions are always zero
 * and the virtualizer computes zero visible rows.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VirtualTable, type VirtualColumn } from './VirtualTable'

// Mock @tanstack/react-virtual so all rows are rendered (jsdom has no layout).
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => {
    const size = estimateSize()
    return {
      getTotalSize: () => count * size,
      getVirtualItems: () =>
        Array.from({ length: count }, (_, i) => ({
          index: i,
          start: i * size,
          size,
          key: i,
        })),
    }
  },
}))

// ── Test data ─────────────────────────────────────────────────

interface TestItem extends Record<string, unknown> {
  id: string
  name: string
  age: number
  city: string
}

const columns: VirtualColumn<TestItem>[] = [
  { key: 'name', header: 'Nome', sortable: true },
  { key: 'age', header: 'Idade', sortable: true, width: 100 },
  { key: 'city', header: 'Cidade' },
]

const testData: TestItem[] = [
  { id: '1', name: 'Alice', age: 30, city: 'SP' },
  { id: '2', name: 'Bob', age: 25, city: 'RJ' },
  { id: '3', name: 'Carlos', age: 40, city: 'BH' },
]

function renderTable(props?: Partial<Parameters<typeof VirtualTable<TestItem>>[0]>) {
  return render(
    <VirtualTable
      data={testData}
      columns={columns}
      keyExtractor={(item) => item.id}
      searchKeys={['name', 'city']}
      {...props}
    />
  )
}

// ── Tests ──────────────────────────────────────────────────────

describe('VirtualTable', () => {
  it('renders column headers', () => {
    renderTable()
    expect(screen.getByText('Nome')).toBeInTheDocument()
    expect(screen.getByText('Idade')).toBeInTheDocument()
    expect(screen.getByText('Cidade')).toBeInTheDocument()
  })

  it('renders row data', () => {
    renderTable()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('Carlos')).toBeInTheDocument()
  })

  it('shows item count', () => {
    renderTable()
    expect(screen.getByText('3 de 3 itens')).toBeInTheDocument()
  })

  it('renders search input by default', () => {
    renderTable()
    expect(screen.getByPlaceholderText('Buscar...')).toBeInTheDocument()
  })

  it('hides search input when searchable is false', () => {
    renderTable({ searchable: false })
    expect(screen.queryByPlaceholderText('Buscar...')).not.toBeInTheDocument()
  })

  it('uses custom search placeholder', () => {
    renderTable({ searchPlaceholder: 'Pesquisar membro...' })
    expect(screen.getByPlaceholderText('Pesquisar membro...')).toBeInTheDocument()
  })

  it('filters data by search text', async () => {
    const user = userEvent.setup()
    renderTable()

    const searchInput = screen.getByPlaceholderText('Buscar...')
    await user.type(searchInput, 'Alice')

    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.queryByText('Bob')).not.toBeInTheDocument()
    expect(screen.queryByText('Carlos')).not.toBeInTheDocument()
    expect(screen.getByText('1 de 3 itens')).toBeInTheDocument()
  })

  it('filters by city', async () => {
    const user = userEvent.setup()
    renderTable()

    const searchInput = screen.getByPlaceholderText('Buscar...')
    await user.type(searchInput, 'RJ')

    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
  })

  it('shows empty state when no results', async () => {
    const user = userEvent.setup()
    renderTable()

    const searchInput = screen.getByPlaceholderText('Buscar...')
    await user.type(searchInput, 'zzzzzzz')

    expect(screen.getByText('Nenhum resultado encontrado')).toBeInTheDocument()
    expect(screen.getByText('0 de 3 itens')).toBeInTheDocument()
  })

  it('shows custom empty state', () => {
    renderTable({
      data: [],
      emptyState: <div>Sem dados custom</div>,
    })
    expect(screen.getByText('Sem dados custom')).toBeInTheDocument()
  })

  it('renders loading skeleton', () => {
    const { container } = renderTable({ loading: true })
    // Skeletons should be rendered; no actual row data
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
    // Should have skeleton elements (animate-pulse class from Skeleton component)
    const skeletons = container.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('sorts by column ascending then descending', async () => {
    const user = userEvent.setup()
    renderTable()

    // Click on "Idade" sort button
    const sortButton = screen.getByRole('button', { name: /Idade/i })
    await user.click(sortButton) // asc

    // After sorting asc by age, Bob (25) should appear first
    const rows = screen.getAllByText(/^(Alice|Bob|Carlos)$/)
    expect(rows[0].textContent).toBe('Bob')

    // Click again for descending
    await user.click(sortButton)
    const rowsDesc = screen.getAllByText(/^(Alice|Bob|Carlos)$/)
    expect(rowsDesc[0].textContent).toBe('Carlos')
  })

  it('clears sort on third click', async () => {
    const user = userEvent.setup()
    renderTable()

    const sortButton = screen.getByRole('button', { name: /Idade/i })
    await user.click(sortButton) // asc
    await user.click(sortButton) // desc
    await user.click(sortButton) // clear sort

    // Back to original order
    const rows = screen.getAllByText(/^(Alice|Bob|Carlos)$/)
    expect(rows[0].textContent).toBe('Alice')
  })

  it('calls onRowClick when a row is clicked', async () => {
    const user = userEvent.setup()
    const onRowClick = vi.fn()
    renderTable({ onRowClick })

    await user.click(screen.getByText('Alice'))

    expect(onRowClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: '1', name: 'Alice' })
    )
  })

  it('renders actions column', () => {
    renderTable({
      actions: (item) => <button>Edit {item.name}</button>,
    })

    expect(screen.getByText('Edit Alice')).toBeInTheDocument()
    expect(screen.getByText('Edit Bob')).toBeInTheDocument()
  })

  it('renders custom cell via render function', () => {
    const customColumns: VirtualColumn<TestItem>[] = [
      {
        key: 'name',
        header: 'Nome',
        render: (item) => <strong data-testid="custom-name">{item.name.toUpperCase()}</strong>,
      },
    ]
    renderTable({ columns: customColumns })

    expect(screen.getByText('ALICE')).toBeInTheDocument()
  })
})
