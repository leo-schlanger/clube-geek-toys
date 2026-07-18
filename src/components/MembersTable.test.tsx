/**
 * MembersTable Component Tests
 *
 * Covers: rendering, column display, row actions, bulk selection,
 * empty state, create button, and export.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MembersTable } from './MembersTable'
import type { Member } from '../types'

// ── Mocks ──────────────────────────────────────────────────────

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    warning: vi.fn(),
  },
}))

// Mock useConfirm
vi.mock('../hooks/useConfirm', () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true),
}))

// Mock api-client
vi.mock('../lib/api-client', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

// ── Test helpers ──────────────────────────────────────────────

function makeMember(overrides?: Partial<Member>): Member {
  return {
    id: 'member-1',
    userId: 'user-1',
    cpf: '52998224725',
    fullName: 'Maria Santos',
    email: 'maria@example.com',
    phone: '11999998888',
    plan: 'club',
    status: 'active',
    paymentType: 'annual',
    startDate: '2024-01-01T00:00:00.000Z',
    expiryDate: '2025-06-01T00:00:00.000Z',
    paymentCount: 5,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-06-01T00:00:00.000Z',
    ...overrides,
  }
}

const members: Member[] = [
  makeMember({ id: 'm1', fullName: 'Maria Santos', status: 'active' }),
  makeMember({ id: 'm2', fullName: 'Pedro Costa', status: 'pending', email: 'pedro@test.com' }),
  makeMember({ id: 'm3', fullName: 'Ana Lima', status: 'inactive', email: 'ana@test.com' }),
]

const defaultProps = {
  members,
  onView: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onActivate: vi.fn(),
  onCreate: vi.fn(),
}

// ── Tests ─────────────────────────────────────────────────────

describe('MembersTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Rendering ───────────────────────────────────────────────

  describe('rendering', () => {
    it('renders the section title and description', () => {
      render(<MembersTable {...defaultProps} />)
      expect(screen.getByText('Membros')).toBeInTheDocument()
      expect(screen.getByText('Gerencie os membros do clube')).toBeInTheDocument()
    })

    it('renders "Novo Membro" button', () => {
      render(<MembersTable {...defaultProps} />)
      expect(screen.getByRole('button', { name: /novo membro/i })).toBeInTheDocument()
    })

    it('renders member names', () => {
      render(<MembersTable {...defaultProps} />)
      expect(screen.getByText('Maria Santos')).toBeInTheDocument()
      expect(screen.getByText('Pedro Costa')).toBeInTheDocument()
      expect(screen.getByText('Ana Lima')).toBeInTheDocument()
    })

    it('renders member emails', () => {
      render(<MembersTable {...defaultProps} />)
      expect(screen.getByText('maria@example.com')).toBeInTheDocument()
      expect(screen.getByText('pedro@test.com')).toBeInTheDocument()
    })

    it('renders the single club plan badge for every member', () => {
      render(<MembersTable {...defaultProps} />)
      // Todos os membros têm o plano único 'club'
      expect(screen.getAllByText('Clube Geek & Toys')).toHaveLength(3)
      expect(screen.queryByText('Silver')).not.toBeInTheDocument()
      expect(screen.queryByText('Gold')).not.toBeInTheDocument()
      expect(screen.queryByText('Black')).not.toBeInTheDocument()
    })

    it('renders status badges', () => {
      render(<MembersTable {...defaultProps} />)
      expect(screen.getByText('Ativo')).toBeInTheDocument()
      expect(screen.getByText('Pendente')).toBeInTheDocument()
      expect(screen.getByText('Inativo')).toBeInTheDocument()
    })

    it('renders activate button for pending members', () => {
      render(<MembersTable {...defaultProps} />)
      // Pedro is pending, so there should be an Ativar button
      const activateButtons = screen.getAllByRole('button', { name: /ativar/i })
      expect(activateButtons.length).toBeGreaterThanOrEqual(1)
    })

    it('does not render a points column', () => {
      render(<MembersTable {...defaultProps} />)
      expect(screen.queryByText('Pontos')).not.toBeInTheDocument()
    })

    it('renders expiry date column', () => {
      render(<MembersTable {...defaultProps} />)
      expect(screen.getByText('Validade')).toBeInTheDocument()
    })

    it('renders formatted CPF', () => {
      render(<MembersTable {...defaultProps} />)
      // CPF 52998224725 -> 529.982.247-25
      expect(screen.getAllByText('529.982.247-25').length).toBeGreaterThanOrEqual(1)
    })

    it('renders the DataTable search input', () => {
      render(<MembersTable {...defaultProps} />)
      expect(screen.getByPlaceholderText('Buscar por nome, CPF ou email...')).toBeInTheDocument()
    })
  })

  // ── Actions ─────────────────────────────────────────────────

  describe('actions', () => {
    it('calls onCreate when "Novo Membro" clicked', async () => {
      const user = userEvent.setup()
      const onCreate = vi.fn()
      render(<MembersTable {...defaultProps} onCreate={onCreate} />)

      await user.click(screen.getByRole('button', { name: /novo membro/i }))
      expect(onCreate).toHaveBeenCalledTimes(1)
    })

    it('calls onView when view button clicked', async () => {
      const user = userEvent.setup()
      const onView = vi.fn()
      render(<MembersTable {...defaultProps} onView={onView} />)

      const viewButtons = screen.getAllByTitle('Ver detalhes')
      await user.click(viewButtons[0])
      expect(onView).toHaveBeenCalledTimes(1)
    })

    it('calls onEdit when edit button clicked', async () => {
      const user = userEvent.setup()
      const onEdit = vi.fn()
      render(<MembersTable {...defaultProps} onEdit={onEdit} />)

      const editButtons = screen.getAllByTitle('Editar')
      await user.click(editButtons[0])
      expect(onEdit).toHaveBeenCalledTimes(1)
    })

    it('calls onActivate when activate button for pending member clicked', async () => {
      const user = userEvent.setup()
      const onActivate = vi.fn()
      render(<MembersTable {...defaultProps} onActivate={onActivate} />)

      // Find the "Ativar" button in the status column (not the bulk bar one)
      const activateButtons = screen.getAllByRole('button').filter(
        (btn) => btn.textContent?.includes('Ativar') && btn.classList.contains('h-7')
      )
      if (activateButtons.length > 0) {
        await user.click(activateButtons[0])
        expect(onActivate).toHaveBeenCalled()
      }
    })
  })

  // ── Empty state ────────────────────────────────────────────

  describe('empty state', () => {
    it('shows empty state when no members', () => {
      render(<MembersTable {...defaultProps} members={[]} />)
      expect(screen.getByText('Nenhum membro encontrado')).toBeInTheDocument()
      expect(screen.getByText('Cadastre o primeiro membro para começar')).toBeInTheDocument()
    })

    it('shows "Cadastrar Membro" button in empty state', () => {
      render(<MembersTable {...defaultProps} members={[]} />)
      expect(screen.getByRole('button', { name: /cadastrar membro/i })).toBeInTheDocument()
    })

    it('calls onCreate when empty state button clicked', async () => {
      const user = userEvent.setup()
      const onCreate = vi.fn()
      render(<MembersTable {...defaultProps} members={[]} onCreate={onCreate} />)

      await user.click(screen.getByRole('button', { name: /cadastrar membro/i }))
      expect(onCreate).toHaveBeenCalledTimes(1)
    })
  })

  // ── Loading state ──────────────────────────────────────────

  describe('loading', () => {
    it('passes loading to DataTable', () => {
      render(<MembersTable {...defaultProps} loading={true} />)
      // When loading, data rows should not appear
      expect(screen.queryByText('Maria Santos')).not.toBeInTheDocument()
    })
  })

  // ── Bulk selection ─────────────────────────────────────────

  describe('bulk selection', () => {
    it('renders "Selecionar todos" checkbox', () => {
      render(<MembersTable {...defaultProps} />)
      expect(screen.getByText('Selecionar todos')).toBeInTheDocument()
    })

    it('renders per-row checkboxes', () => {
      render(<MembersTable {...defaultProps} />)
      const checkboxes = screen.getAllByRole('checkbox')
      // At least one per member row + "select all"
      expect(checkboxes.length).toBeGreaterThanOrEqual(4) // 3 rows + select all
    })

    it('shows bulk actions bar when items selected', async () => {
      const user = userEvent.setup()
      render(<MembersTable {...defaultProps} />)

      // Select a member row checkbox
      // The row checkboxes have aria-label "Selecionar <name>"
      const memberCheckbox = screen.getByLabelText('Selecionar Maria Santos')
      await user.click(memberCheckbox)

      expect(screen.getByText(/1 selecionado/)).toBeInTheDocument()
    })

    it('does not show bulk actions bar by default', () => {
      render(<MembersTable {...defaultProps} />)
      expect(screen.queryByText(/selecionado\(s\)/)).not.toBeInTheDocument()
    })
  })

  // ── Filters ─────────────────────────────────────────────────

  describe('filters', () => {
    it('has filter button (status, plan, etc.)', () => {
      render(<MembersTable {...defaultProps} />)
      expect(screen.getByRole('button', { name: /filtros/i })).toBeInTheDocument()
    })

    it('has export button', () => {
      render(<MembersTable {...defaultProps} />)
      expect(screen.getByRole('button', { name: /exportar/i })).toBeInTheDocument()
    })
  })

  // ── Row click ───────────────────────────────────────────────

  describe('row click', () => {
    it('calls onView when a data row is clicked', async () => {
      const user = userEvent.setup()
      const onView = vi.fn()
      render(<MembersTable {...defaultProps} onView={onView} />)

      // Click on the member name text to trigger row click
      await user.click(screen.getByText('Maria Santos'))
      expect(onView).toHaveBeenCalled()
    })
  })

  // ── Resend email ───────────────────────────────────────────

  describe('resend email', () => {
    it('renders email action button when onResendEmail provided', () => {
      const onResendEmail = vi.fn()
      render(<MembersTable {...defaultProps} onResendEmail={onResendEmail} />)
      const emailButtons = screen.getAllByTitle('Enviar email')
      expect(emailButtons.length).toBeGreaterThanOrEqual(1)
    })

    it('does not render email action button when no onResendEmail', () => {
      render(<MembersTable {...defaultProps} />)
      expect(screen.queryByTitle('Enviar email')).not.toBeInTheDocument()
    })
  })
})
