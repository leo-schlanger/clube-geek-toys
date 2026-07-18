import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UsersTab } from './UsersTab'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('lucide-react', () => {
  const icon = ({ children, ...props }: Record<string, unknown>) => <span {...props}>{children as string}</span>
  return {
    Plus: icon, Shield: icon, UserCog: icon, UserX: icon, Ban: icon,
  }
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface SystemUser {
  id: string
  email: string
  role: string
  createdAt?: string
  disabledAt?: string
}

const sampleUsers: SystemUser[] = [
  { id: 'user-1', email: 'admin@example.com', role: 'admin', createdAt: '2026-01-15T00:00:00Z' },
  { id: 'user-2', email: 'seller@example.com', role: 'seller', createdAt: '2026-02-10T00:00:00Z' },
  { id: 'user-3', email: 'member@example.com', role: 'member', createdAt: '2026-03-20T00:00:00Z' },
  { id: 'user-4', email: 'disabled@example.com', role: 'disabled', createdAt: '2026-01-01T00:00:00Z', disabledAt: '2026-04-01T00:00:00Z' },
]

const defaultProps = {
  users: sampleUsers,
  onCreateUser: vi.fn(),
  onUpdateRole: vi.fn(),
  onDeleteUser: vi.fn(),
}

function renderTab(overrides = {}) {
  return render(<UsersTab {...defaultProps} {...overrides} />)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('UsersTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Rendering ──

  it('renders title and description', () => {
    renderTab()
    expect(screen.getByText('Usuários do Sistema')).toBeInTheDocument()
    expect(screen.getByText('Gerencie o acesso e cargos dos usuários cadastrados')).toBeInTheDocument()
  })

  it('renders new user button', () => {
    renderTab()
    expect(screen.getByText('Novo Usuário')).toBeInTheDocument()
  })

  it('renders table headers', () => {
    renderTab()
    expect(screen.getByText('Usuário')).toBeInTheDocument()
    expect(screen.getByText('Cargo')).toBeInTheDocument()
    expect(screen.getByText('Cadastro em')).toBeInTheDocument()
    expect(screen.getByText('Ações')).toBeInTheDocument()
  })

  // ── User rows ──

  it('renders all user emails', () => {
    renderTab()
    expect(screen.getByText('admin@example.com')).toBeInTheDocument()
    expect(screen.getByText('seller@example.com')).toBeInTheDocument()
    expect(screen.getByText('member@example.com')).toBeInTheDocument()
    expect(screen.getByText('disabled@example.com')).toBeInTheDocument()
  })

  it('renders user IDs', () => {
    renderTab()
    expect(screen.getByText('user-1')).toBeInTheDocument()
    expect(screen.getByText('user-2')).toBeInTheDocument()
  })

  it('renders role badges', () => {
    renderTab()
    // Role text may appear in both the badge and the select dropdown
    expect(screen.getAllByText('admin').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('seller').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('member').length).toBeGreaterThanOrEqual(1)
    // "Desativado" appears in the badge for the disabled user
    expect(screen.getAllByText('Desativado').length).toBeGreaterThanOrEqual(1)
  })

  it('renders creation dates', () => {
    renderTab()
    // Dates are formatted as pt-BR locale
    expect(screen.getByText('15/01/2026')).toBeInTheDocument()
    expect(screen.getByText('10/02/2026')).toBeInTheDocument()
  })

  it('shows N/A when createdAt is missing', () => {
    renderTab({ users: [{ id: 'u1', email: 'no-date@test.com', role: 'member' }] })
    expect(screen.getByText('N/A')).toBeInTheDocument()
  })

  it('applies opacity to disabled users', () => {
    const { container } = renderTab()
    const rows = container.querySelectorAll('tbody tr')
    const disabledRow = Array.from(rows).find(r => r.textContent?.includes('disabled@example.com'))!
    expect(disabledRow).toHaveClass('opacity-50')
  })

  // ── Actions ──

  it('calls onCreateUser when new user button is clicked', async () => {
    const user = userEvent.setup()
    const onCreateUser = vi.fn()
    renderTab({ onCreateUser })

    await user.click(screen.getByText('Novo Usuário'))
    expect(onCreateUser).toHaveBeenCalled()
  })

  it('renders role select dropdowns for each user', () => {
    renderTab()
    const selects = screen.getAllByRole('combobox')
    expect(selects.length).toBe(4) // one per user
  })

  it('calls onUpdateRole when role is changed', async () => {
    const user = userEvent.setup()
    const onUpdateRole = vi.fn()
    renderTab({ onUpdateRole })

    const selects = screen.getAllByRole('combobox')
    // Change the first user's role from admin to seller
    await user.selectOptions(selects[0], 'seller')

    expect(onUpdateRole).toHaveBeenCalledWith('user-1', 'seller')
  })

  it('shows disable button for active users only', () => {
    renderTab()
    // The disabled user (user-4) should NOT have a delete button
    // Active users (user-1, user-2, user-3) should have delete buttons
    const deleteButtons = screen.getAllByTitle('Desativar usuário')
    expect(deleteButtons.length).toBe(3) // admin, seller, member — not disabled
  })

  it('calls onDeleteUser when disable button is clicked', async () => {
    const user = userEvent.setup()
    const onDeleteUser = vi.fn()
    renderTab({ onDeleteUser })

    const deleteButtons = screen.getAllByTitle('Desativar usuário')
    await user.click(deleteButtons[0])

    expect(onDeleteUser).toHaveBeenCalledWith('user-1', 'admin@example.com')
  })

  it('disabled user has "disabled" option in select', () => {
    renderTab()
    const selects = screen.getAllByRole('combobox')
    // The disabled user (last one) should have a "Desativado" option
    const disabledSelect = selects[3]
    const options = disabledSelect.querySelectorAll('option')
    const optionValues = Array.from(options).map(o => o.value)
    expect(optionValues).toContain('disabled')
  })

  it('active users do not have "disabled" option in select', () => {
    renderTab()
    const selects = screen.getAllByRole('combobox')
    const activeSelect = selects[0] // admin user
    const options = activeSelect.querySelectorAll('option')
    const optionValues = Array.from(options).map(o => o.value)
    expect(optionValues).not.toContain('disabled')
  })

  // ── Empty state ──

  it('shows empty state when no users', () => {
    renderTab({ users: [] })
    expect(screen.getByText('Nenhum usuário encontrado')).toBeInTheDocument()
    expect(screen.getByText(/Os usuários aparecem aqui após se cadastrarem/)).toBeInTheDocument()
  })
})
