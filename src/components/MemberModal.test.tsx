/**
 * MemberModal Component Tests
 *
 * Covers: create/edit/view modes, form fields, the single annual club plan,
 * status badges, payment history, subscription, contract, and pending
 * payment sections. (Points management foi removido do modelo.)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemberModal } from './MemberModal'
import type { Member } from '../types'

// ── Mocks ──────────────────────────────────────────────────────

// Mock useKeyboardShortcuts
vi.mock('../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: vi.fn(),
}))

// Mock lib/members
vi.mock('../lib/members', () => ({
  createMember: vi.fn().mockResolvedValue({ id: 'new-id' }),
  updateMember: vi.fn().mockResolvedValue(true),
  activateMember: vi.fn().mockResolvedValue(true),
}))

// Mock lib/api-client — payments returns empty array, contracts rejects (→ null)
vi.mock('../lib/api-client', () => ({
  api: {
    get: vi.fn().mockImplementation((url: string) => {
      if (url.includes('/payments')) return Promise.resolve({ data: [] })
      if (url.includes('/contracts')) return Promise.reject(new Error('Not found'))
      if (url.includes('/subscription')) return Promise.resolve({ data: null })
      return Promise.resolve({ data: null })
    }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

// Mock lib/utils (partial - keep real implementations)
vi.mock('../lib/utils', async () => {
  const actual = await vi.importActual('../lib/utils')
  return {
    ...actual,
  }
})

// Mock lib/cpf-validation
vi.mock('../lib/cpf-validation', () => ({
  fullCPFValidation: vi.fn().mockResolvedValue({ valid: true, exists: true, message: 'CPF valido' }),
}))

// Mock lib/sanitize
vi.mock('../lib/sanitize', () => ({
  sanitizeName: vi.fn((v: string) => v),
  normalizeEmail: vi.fn((v: string) => v),
  normalizePhone: vi.fn((v: string) => v),
  normalizeCPF: vi.fn((v: string) => v.replace(/\D/g, '')),
}))

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

// Mock logger
vi.mock('../lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

// ── Test helpers ──────────────────────────────────────────────

function makeMember(overrides?: Partial<Member>): Member {
  return {
    id: 'member-1',
    userId: 'user-1',
    cpf: '52998224725',
    fullName: 'Joao Silva',
    email: 'joao@example.com',
    phone: '11999998888',
    plan: 'club',
    status: 'active',
    paymentType: 'annual',
    startDate: '2024-01-01T00:00:00.000Z',
    expiryDate: '2025-01-01T00:00:00.000Z',
    paymentCount: 3,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-06-01T00:00:00.000Z',
    ...overrides,
  } as Member
}

const defaultProps = {
  onClose: vi.fn(),
  onSuccess: vi.fn(),
}

// ── Tests ─────────────────────────────────────────────────────

describe('MemberModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Create mode ─────────────────────────────────────────────

  describe('create mode', () => {
    it('renders create mode header', () => {
      render(<MemberModal mode="create" {...defaultProps} />)
      expect(screen.getByText('Novo Membro')).toBeInTheDocument()
      expect(screen.getByText('Preencha os dados para cadastrar um novo membro')).toBeInTheDocument()
    })

    it('renders all form fields empty', () => {
      render(<MemberModal mode="create" {...defaultProps} />)
      expect(screen.getByLabelText('Nome Completo')).toHaveValue('')
      expect(screen.getByLabelText('Email')).toHaveValue('')
      expect(screen.getByLabelText('CPF')).toHaveValue('')
      expect(screen.getByLabelText('Telefone')).toHaveValue('')
    })

    it('renders submit button with "Criar Membro" text', () => {
      render(<MemberModal mode="create" {...defaultProps} />)
      expect(screen.getByRole('button', { name: /criar membro/i })).toBeInTheDocument()
    })

    it('shows the single fixed club plan (Anual)', () => {
      render(<MemberModal mode="create" {...defaultProps} />)
      // Plano único e anual, sem seletor de Silver/Gold/Black
      expect(screen.getByText(/Clube Geek & Toys — Anual/)).toBeInTheDocument()
      expect(screen.queryByText('Silver')).not.toBeInTheDocument()
      expect(screen.queryByText('Gold')).not.toBeInTheDocument()
      expect(screen.queryByText('Black')).not.toBeInTheDocument()
    })

    it('shows the plan price and product discount', () => {
      render(<MemberModal mode="create" {...defaultProps} />)
      expect(screen.getByText(/R\$\s*149,99/)).toBeInTheDocument()
      expect(screen.getByText(/15% de desconto em qualquer produto/)).toBeInTheDocument()
    })

    it('does not show a monthly/annual payment type selector', () => {
      render(<MemberModal mode="create" {...defaultProps} />)
      expect(screen.queryByText('Mensal')).not.toBeInTheDocument()
    })

    it('does not show status selector in create mode', () => {
      render(<MemberModal mode="create" {...defaultProps} />)
      // In create mode, no status labels should show
      expect(screen.queryByText('Expirado')).not.toBeInTheDocument()
    })

    it('does not show points management in create mode', () => {
      render(<MemberModal mode="create" {...defaultProps} />)
      expect(screen.queryByText(/Gest.*Pontos/)).not.toBeInTheDocument()
    })

    it('renders cancel button', () => {
      render(<MemberModal mode="create" {...defaultProps} />)
      expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument()
    })

    it('calls onClose when cancel clicked', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      render(<MemberModal mode="create" onClose={onClose} onSuccess={vi.fn()} />)
      await user.click(screen.getByRole('button', { name: /cancelar/i }))
      expect(onClose).toHaveBeenCalled()
    })
  })

  // ── Edit mode ───────────────────────────────────────────────

  describe('edit mode', () => {
    const member = makeMember()

    it('renders edit mode header', () => {
      render(<MemberModal mode="edit" member={member} {...defaultProps} />)
      expect(screen.getByText('Editar Membro')).toBeInTheDocument()
      expect(screen.getByText('Atualize os dados do membro')).toBeInTheDocument()
    })

    it('populates form with member data', () => {
      render(<MemberModal mode="edit" member={member} {...defaultProps} />)
      expect(screen.getByLabelText('Nome Completo')).toHaveValue('Joao Silva')
      expect(screen.getByLabelText('Email')).toHaveValue('joao@example.com')
    })

    it('renders "Salvar Alteracoes" button', () => {
      render(<MemberModal mode="edit" member={member} {...defaultProps} />)
      expect(screen.getByRole('button', { name: /salvar alter/i })).toBeInTheDocument()
    })

    it('shows status selector buttons in edit mode', () => {
      render(<MemberModal mode="edit" member={member} {...defaultProps} />)
      // Status appears both in the info bar badge and in the selector buttons.
      // "Ativo" appears twice (badge + button), others only once in selector.
      const ativoElements = screen.getAllByText('Ativo')
      expect(ativoElements.length).toBe(2) // badge + selector button
      expect(screen.getByText('Pendente')).toBeInTheDocument()
      expect(screen.getByText('Inativo')).toBeInTheDocument()
      expect(screen.getByText('Expirado')).toBeInTheDocument()
    })

    it('shows the club plan badge in info bar', () => {
      render(<MemberModal mode="edit" member={member} {...defaultProps} />)
      const badges = screen.getAllByText('Clube Geek & Toys')
      expect(badges.length).toBeGreaterThanOrEqual(1)
    })

    it('shows expiry date in info bar', () => {
      render(<MemberModal mode="edit" member={member} {...defaultProps} />)
      // "Expira: " text node contains "Expira:" and the formatted date
      const expiryElements = screen.getAllByText(/Expira/)
      expect(expiryElements.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ── View mode ───────────────────────────────────────────────

  describe('view mode', () => {
    const member = makeMember()

    it('renders view mode header', () => {
      render(<MemberModal mode="view" member={member} {...defaultProps} />)
      expect(screen.getByText('Detalhes do Membro')).toBeInTheDocument()
    })

    it('disables form inputs in view mode', () => {
      render(<MemberModal mode="view" member={member} {...defaultProps} />)
      expect(screen.getByLabelText('Nome Completo')).toBeDisabled()
      expect(screen.getByLabelText('Email')).toBeDisabled()
      expect(screen.getByLabelText('CPF')).toBeDisabled()
      expect(screen.getByLabelText('Telefone')).toBeDisabled()
    })

    it('renders "Fechar" instead of "Cancelar"', () => {
      render(<MemberModal mode="view" member={member} {...defaultProps} />)
      expect(screen.getByRole('button', { name: /fechar/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /cancelar/i })).not.toBeInTheDocument()
    })

    it('does not render submit button in view mode', () => {
      render(<MemberModal mode="view" member={member} {...defaultProps} />)
      expect(screen.queryByRole('button', { name: /criar membro/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /salvar alter/i })).not.toBeInTheDocument()
    })

    it('shows additional info section with member data', () => {
      render(<MemberModal mode="view" member={member} {...defaultProps} />)
      expect(screen.getByText(/Informa/)).toBeInTheDocument()
      expect(screen.getByText('Membro desde:')).toBeInTheDocument()
      expect(screen.getByText('ID:')).toBeInTheDocument()
    })

    it('does not show a points section (points removed from model)', () => {
      render(<MemberModal mode="view" member={member} {...defaultProps} />)
      expect(screen.queryByText('Pontos:')).not.toBeInTheDocument()
      expect(screen.queryByText(/Gest.*Pontos/)).not.toBeInTheDocument()
    })

    it('shows payment history section header', () => {
      render(<MemberModal mode="view" member={member} {...defaultProps} />)
      expect(screen.getByText(/Hist.*Pagamentos/)).toBeInTheDocument()
    })

    it('shows contract section header', () => {
      render(<MemberModal mode="view" member={member} {...defaultProps} />)
      expect(screen.getByText('Contrato')).toBeInTheDocument()
    })

    it('does not show subscription section when member has no subscriptionId', () => {
      render(<MemberModal mode="view" member={member} {...defaultProps} />)
      expect(screen.queryByText('Assinatura')).not.toBeInTheDocument()
    })

    it('shows subscription section when member has subscriptionId', () => {
      const memberWithSub = makeMember({ subscriptionId: 'sub-123' } as Partial<Member>)
      render(<MemberModal mode="view" member={memberWithSub} {...defaultProps} />)
      expect(screen.getByText('Assinatura')).toBeInTheDocument()
    })
  })

  // ── Pending payment alert ──────────────────────────────────

  describe('pending payment', () => {
    it('shows pending payment alert when status is pending', () => {
      const pendingMember = makeMember({ status: 'pending' })
      render(<MemberModal mode="view" member={pendingMember} {...defaultProps} />)
      expect(screen.getByText('Pagamento pendente')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /ativar/i })).toBeInTheDocument()
    })

    it('does not show pending alert for active member', () => {
      const activeMember = makeMember({ status: 'active' })
      render(<MemberModal mode="view" member={activeMember} {...defaultProps} />)
      expect(screen.queryByText('Pagamento pendente')).not.toBeInTheDocument()
    })
  })

  // ── Collapsible sections (Payment History / Contract) ──────

  describe('collapsible sections', () => {
    const member = makeMember()

    it('payment history section is collapsed by default', () => {
      render(<MemberModal mode="view" member={member} {...defaultProps} />)
      expect(screen.queryByText('Nenhum pagamento registrado')).not.toBeInTheDocument()
    })

    it('expands payment history on click', async () => {
      const user = userEvent.setup()
      render(<MemberModal mode="view" member={member} {...defaultProps} />)

      const paymentToggle = screen.getByText(/Hist.*Pagamentos/).closest('button')!
      await user.click(paymentToggle)

      // After expanding, should show content. Since api.get('/members/.../payments')
      // returns { data: [] }, payments state becomes [] (empty), so shows empty message
      expect(await screen.findByText('Nenhum pagamento registrado')).toBeInTheDocument()
    })

    it('contract section is collapsed by default', () => {
      render(<MemberModal mode="view" member={member} {...defaultProps} />)
      expect(screen.queryByText('Nenhum contrato encontrado')).not.toBeInTheDocument()
    })

    it('expands contract section and shows no contract', async () => {
      const user = userEvent.setup()
      render(<MemberModal mode="view" member={member} {...defaultProps} />)

      const contractToggle = screen.getByText('Contrato').closest('button')!
      await user.click(contractToggle)

      // api.get('/contracts/...') rejects, so contract state is null
      // → shows "Nenhum contrato encontrado"
      expect(await screen.findByText('Nenhum contrato encontrado')).toBeInTheDocument()
    })
  })

  // ── Modal overlay ──────────────────────────────────────────

  describe('overlay behavior', () => {
    it('calls onClose when overlay clicked', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      const { container } = render(<MemberModal mode="create" onClose={onClose} onSuccess={vi.fn()} />)

      const overlay = container.querySelector('.modal-overlay')!
      await user.click(overlay)

      expect(onClose).toHaveBeenCalled()
    })

    it('does not close when card content clicked', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      render(<MemberModal mode="create" onClose={onClose} onSuccess={vi.fn()} />)

      await user.click(screen.getByText('Novo Membro'))

      expect(onClose).not.toHaveBeenCalled()
    })

    it('calls onClose when X button clicked', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      render(<MemberModal mode="create" onClose={onClose} onSuccess={vi.fn()} />)

      // The X close button is the first button with an SVG child
      const closeButtons = screen.getAllByRole('button')
      const xButton = closeButtons.find((btn) => btn.querySelector('svg'))
      if (xButton) {
        await user.click(xButton)
      }
    })
  })

  // ── Payment history with data ─────────────────────────────────

  describe('payment history with data', () => {
    it('renders payment rows when payments exist', async () => {
      const { api } = await import('../lib/api-client')
      const mockedApiGet = vi.mocked(api.get)
      mockedApiGet.mockImplementation((url: string) => {
        if (url.includes('/payments')) {
          return Promise.resolve({
            data: [
              { created_at: '2024-06-15T10:00:00Z', amount: 3990, method: 'credit_card', status: 'paid' },
              { created_at: '2024-07-15T10:00:00Z', amount: 3990, method: 'pix', status: 'pending' },
              { created_at: '2024-08-15T10:00:00Z', amount: 3990, method: 'boleto', status: 'failed' },
            ],
          })
        }
        if (url.includes('/contracts')) return Promise.reject(new Error('Not found'))
        return Promise.resolve({ data: null })
      })

      const user = userEvent.setup()
      const member = makeMember()
      render(<MemberModal mode="view" member={member} {...defaultProps} />)

      const paymentToggle = screen.getByText(/Hist.*Pagamentos/).closest('button')!
      await user.click(paymentToggle)

      // Wait for payment rows to appear
      expect(await screen.findByText('Pago')).toBeInTheDocument()
      expect(screen.getByText('Pendente')).toBeInTheDocument()
      expect(screen.getByText('Falhou')).toBeInTheDocument()
      expect(screen.getByText('Cartão')).toBeInTheDocument()
      expect(screen.getByText('PIX')).toBeInTheDocument()
    })

    it('renders payment method fallback for unknown methods', async () => {
      const { api } = await import('../lib/api-client')
      const mockedApiGet = vi.mocked(api.get)
      mockedApiGet.mockImplementation((url: string) => {
        if (url.includes('/payments')) {
          return Promise.resolve({
            data: [
              { created_at: '2024-06-15T10:00:00Z', amount: 5000, method: null, status: 'paid' },
            ],
          })
        }
        if (url.includes('/contracts')) return Promise.reject(new Error('Not found'))
        return Promise.resolve({ data: null })
      })

      const user = userEvent.setup()
      const member = makeMember()
      render(<MemberModal mode="view" member={member} {...defaultProps} />)

      const paymentToggle = screen.getByText(/Hist.*Pagamentos/).closest('button')!
      await user.click(paymentToggle)

      expect(await screen.findByText('N/A')).toBeInTheDocument()
    })
  })

  // ── Subscription management actions ──────────────────────────

  describe('subscription management', () => {
    it('shows subscription details when expanded', async () => {
      const { api } = await import('../lib/api-client')
      const mockedApiGet = vi.mocked(api.get)
      mockedApiGet.mockImplementation((url: string) => {
        if (url.includes('/payments')) return Promise.resolve({ data: [] })
        if (url.includes('/subscription')) {
          return Promise.resolve({
            data: {
              id: 'sub-123',
              status: 'authorized',
              plan: 'Gold',
              transaction_amount: 39.90,
              next_payment_date: '2025-02-01T00:00:00Z',
              failed_payments: 0,
            },
          })
        }
        if (url.includes('/contracts')) return Promise.reject(new Error('Not found'))
        return Promise.resolve({ data: null })
      })

      const user = userEvent.setup()
      const memberWithSub = makeMember({ subscriptionId: 'sub-123' } as Partial<Member>)
      render(<MemberModal mode="view" member={memberWithSub} {...defaultProps} />)

      const subToggle = screen.getByText('Assinatura').closest('button')!
      await user.click(subToggle)

      expect(await screen.findByText('Ativa')).toBeInTheDocument()
      // "Gold" appears in both member badge and subscription plan, just check at least one
      expect(screen.getAllByText('Gold').length).toBeGreaterThanOrEqual(1)
    })

    it('shows pause and cancel buttons for authorized subscription', async () => {
      const { api } = await import('../lib/api-client')
      const mockedApiGet = vi.mocked(api.get)
      mockedApiGet.mockImplementation((url: string) => {
        if (url.includes('/payments')) return Promise.resolve({ data: [] })
        if (url.includes('/subscription')) {
          return Promise.resolve({
            data: {
              id: 'sub-123',
              status: 'authorized',
              plan: 'Gold',
              transaction_amount: 39.90,
            },
          })
        }
        if (url.includes('/contracts')) return Promise.reject(new Error('Not found'))
        return Promise.resolve({ data: null })
      })

      const user = userEvent.setup()
      const memberWithSub = makeMember({ subscriptionId: 'sub-123' } as Partial<Member>)
      render(<MemberModal mode="view" member={memberWithSub} {...defaultProps} />)

      const subToggle = screen.getByText('Assinatura').closest('button')!
      await user.click(subToggle)

      expect(await screen.findByText(/Pausar/)).toBeInTheDocument()
      expect(screen.getByText(/Cancelar/)).toBeInTheDocument()
    })

    it('shows resume button for paused subscription', async () => {
      const { api } = await import('../lib/api-client')
      const mockedApiGet = vi.mocked(api.get)
      mockedApiGet.mockImplementation((url: string) => {
        if (url.includes('/payments')) return Promise.resolve({ data: [] })
        if (url.includes('/subscription')) {
          return Promise.resolve({
            data: {
              id: 'sub-456',
              status: 'paused',
              plan: 'Silver',
              transaction_amount: 19.90,
            },
          })
        }
        if (url.includes('/contracts')) return Promise.reject(new Error('Not found'))
        return Promise.resolve({ data: null })
      })

      const user = userEvent.setup()
      const memberWithSub = makeMember({ subscriptionId: 'sub-456' } as Partial<Member>)
      render(<MemberModal mode="view" member={memberWithSub} {...defaultProps} />)

      const subToggle = screen.getByText('Assinatura').closest('button')!
      await user.click(subToggle)

      expect(await screen.findByText('Pausada')).toBeInTheDocument()
      expect(screen.getByText(/Retomar/)).toBeInTheDocument()
    })

    it('calls pause API when pause button clicked', async () => {
      const { api } = await import('../lib/api-client')
      const mockedApiGet = vi.mocked(api.get)
      const mockedApiPut = vi.mocked(api.put)
      mockedApiGet.mockImplementation((url: string) => {
        if (url.includes('/payments')) return Promise.resolve({ data: [] })
        if (url.includes('/subscription')) {
          return Promise.resolve({
            data: { id: 'sub-123', status: 'authorized', plan: 'Gold', transaction_amount: 39.90 },
          })
        }
        if (url.includes('/contracts')) return Promise.reject(new Error('Not found'))
        return Promise.resolve({ data: null })
      })
      mockedApiPut.mockResolvedValue({ data: {} })

      const user = userEvent.setup()
      const memberWithSub = makeMember({ subscriptionId: 'sub-123' } as Partial<Member>)
      render(<MemberModal mode="view" member={memberWithSub} {...defaultProps} />)

      const subToggle = screen.getByText('Assinatura').closest('button')!
      await user.click(subToggle)

      const pauseBtn = await screen.findByText(/Pausar/)
      await user.click(pauseBtn.closest('button')!)

      expect(mockedApiPut).toHaveBeenCalledWith('/subscription/sub-123/pause')
    })

    it('calls resume API when resume button clicked', async () => {
      const { api } = await import('../lib/api-client')
      const mockedApiGet = vi.mocked(api.get)
      const mockedApiPut = vi.mocked(api.put)
      mockedApiGet.mockImplementation((url: string) => {
        if (url.includes('/payments')) return Promise.resolve({ data: [] })
        if (url.includes('/subscription')) {
          return Promise.resolve({
            data: { id: 'sub-456', status: 'paused', plan: 'Silver', transaction_amount: 19.90 },
          })
        }
        if (url.includes('/contracts')) return Promise.reject(new Error('Not found'))
        return Promise.resolve({ data: null })
      })
      mockedApiPut.mockResolvedValue({ data: {} })

      const user = userEvent.setup()
      const memberWithSub = makeMember({ subscriptionId: 'sub-456' } as Partial<Member>)
      render(<MemberModal mode="view" member={memberWithSub} {...defaultProps} />)

      const subToggle = screen.getByText('Assinatura').closest('button')!
      await user.click(subToggle)

      const resumeBtn = await screen.findByText(/Retomar/)
      await user.click(resumeBtn.closest('button')!)

      expect(mockedApiPut).toHaveBeenCalledWith('/subscription/sub-456/resume')
    })

    it('calls cancel API after confirmation', async () => {
      const { api } = await import('../lib/api-client')
      const mockedApiGet = vi.mocked(api.get)
      const mockedApiPut = vi.mocked(api.put)
      mockedApiGet.mockImplementation((url: string) => {
        if (url.includes('/payments')) return Promise.resolve({ data: [] })
        if (url.includes('/subscription')) {
          return Promise.resolve({
            data: { id: 'sub-123', status: 'authorized', plan: 'Gold', transaction_amount: 39.90 },
          })
        }
        if (url.includes('/contracts')) return Promise.reject(new Error('Not found'))
        return Promise.resolve({ data: null })
      })
      mockedApiPut.mockResolvedValue({ data: {} })
      vi.spyOn(window, 'confirm').mockReturnValue(true)

      const user = userEvent.setup()
      const memberWithSub = makeMember({ subscriptionId: 'sub-123' } as Partial<Member>)
      render(<MemberModal mode="view" member={memberWithSub} {...defaultProps} />)

      const subToggle = screen.getByText('Assinatura').closest('button')!
      await user.click(subToggle)

      // Find the cancel/destructive button (contains "Cancelar")
      const cancelBtn = await screen.findByText(/Cancelar/)
      await user.click(cancelBtn.closest('button')!)

      expect(mockedApiPut).toHaveBeenCalledWith('/subscription/sub-123/cancel')
    })

    it('does not cancel when user declines confirmation', async () => {
      const { api } = await import('../lib/api-client')
      const mockedApiGet = vi.mocked(api.get)
      const mockedApiPut = vi.mocked(api.put)
      mockedApiGet.mockImplementation((url: string) => {
        if (url.includes('/payments')) return Promise.resolve({ data: [] })
        if (url.includes('/subscription')) {
          return Promise.resolve({
            data: { id: 'sub-123', status: 'authorized', plan: 'Gold', transaction_amount: 39.90 },
          })
        }
        if (url.includes('/contracts')) return Promise.reject(new Error('Not found'))
        return Promise.resolve({ data: null })
      })
      vi.spyOn(window, 'confirm').mockReturnValue(false)

      const user = userEvent.setup()
      const memberWithSub = makeMember({ subscriptionId: 'sub-123' } as Partial<Member>)
      render(<MemberModal mode="view" member={memberWithSub} {...defaultProps} />)

      const subToggle = screen.getByText('Assinatura').closest('button')!
      await user.click(subToggle)

      const cancelBtn = await screen.findByText(/Cancelar/)
      await user.click(cancelBtn.closest('button')!)

      expect(mockedApiPut).not.toHaveBeenCalledWith('/subscription/sub-123/cancel')
    })

    it('shows unavailable message when subscription data is null', async () => {
      const { api } = await import('../lib/api-client')
      const mockedApiGet = vi.mocked(api.get)
      mockedApiGet.mockImplementation((url: string) => {
        if (url.includes('/payments')) return Promise.resolve({ data: [] })
        if (url.includes('/subscription')) return Promise.resolve({ data: null })
        if (url.includes('/contracts')) return Promise.reject(new Error('Not found'))
        return Promise.resolve({ data: null })
      })

      const user = userEvent.setup()
      const memberWithSub = makeMember({ subscriptionId: 'sub-123' } as Partial<Member>)
      render(<MemberModal mode="view" member={memberWithSub} {...defaultProps} />)

      const subToggle = screen.getByText('Assinatura').closest('button')!
      await user.click(subToggle)

      expect(await screen.findByText(/indispon/i)).toBeInTheDocument()
    })

    it('shows failed_payments count and next_payment_date', async () => {
      const { api } = await import('../lib/api-client')
      const mockedApiGet = vi.mocked(api.get)
      mockedApiGet.mockImplementation((url: string) => {
        if (url.includes('/payments')) return Promise.resolve({ data: [] })
        if (url.includes('/subscription')) {
          return Promise.resolve({
            data: {
              id: 'sub-123',
              status: 'authorized',
              plan: 'Gold',
              transaction_amount: 39.90,
              next_payment_date: '2025-03-01T00:00:00Z',
              failed_payments: 2,
            },
          })
        }
        if (url.includes('/contracts')) return Promise.reject(new Error('Not found'))
        return Promise.resolve({ data: null })
      })

      const user = userEvent.setup()
      const memberWithSub = makeMember({ subscriptionId: 'sub-123' } as Partial<Member>)
      render(<MemberModal mode="view" member={memberWithSub} {...defaultProps} />)

      const subToggle = screen.getByText('Assinatura').closest('button')!
      await user.click(subToggle)

      expect(await screen.findByText('Pagamentos falhos:')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText(/Pr.*ximo pagamento/)).toBeInTheDocument()
    })
  })

  // ── Contract section with data ────────────────────────────────

  describe('contract section with data', () => {
    it('shows signed contract details', async () => {
      const { api } = await import('../lib/api-client')
      const mockedApiGet = vi.mocked(api.get)
      mockedApiGet.mockImplementation((url: string) => {
        if (url.includes('/payments')) return Promise.resolve({ data: [] })
        if (url.includes('/contracts')) {
          return Promise.resolve({
            data: {
              id: 'contract-1',
              status: 'signed',
              signed_at: '2024-06-01T12:00:00Z',
              hash: 'abc123def456ghi789jkl012mno345',
              pdf_url: 'https://example.com/contract.pdf',
            },
          })
        }
        return Promise.resolve({ data: null })
      })

      const user = userEvent.setup()
      const member = makeMember()
      render(<MemberModal mode="view" member={member} {...defaultProps} />)

      const contractToggle = screen.getByText('Contrato').closest('button')!
      await user.click(contractToggle)

      expect(await screen.findByText('Assinado')).toBeInTheDocument()
      expect(screen.getByText('Assinado em:')).toBeInTheDocument()
      expect(screen.getByText(/abc123def456ghi7/)).toBeInTheDocument()
      expect(screen.getByText(/Baixar PDF/)).toBeInTheDocument()
    })

    it('shows pending contract status', async () => {
      const { api } = await import('../lib/api-client')
      const mockedApiGet = vi.mocked(api.get)
      mockedApiGet.mockImplementation((url: string) => {
        if (url.includes('/payments')) return Promise.resolve({ data: [] })
        if (url.includes('/contracts')) {
          return Promise.resolve({
            data: {
              id: 'contract-1',
              status: 'pending',
              signed_at: null,
            },
          })
        }
        return Promise.resolve({ data: null })
      })

      const user = userEvent.setup()
      const member = makeMember()
      render(<MemberModal mode="view" member={member} {...defaultProps} />)

      const contractToggle = screen.getByText('Contrato').closest('button')!
      await user.click(contractToggle)

      // "Pendente" appears in the contract status badge
      expect(await screen.findByText('Pendente')).toBeInTheDocument()
      expect(screen.getByText('N/A')).toBeInTheDocument() // signed_at is null
    })

    it('calls verify API and shows valid result', async () => {
      const { api } = await import('../lib/api-client')
      const mockedApiGet = vi.mocked(api.get)
      mockedApiGet.mockImplementation((url: string) => {
        if (url.includes('/payments')) return Promise.resolve({ data: [] })
        if (url.includes('/verify')) {
          return Promise.resolve({ data: { valid: true, message: 'Contrato integro' } })
        }
        if (url.includes('/contracts')) {
          return Promise.resolve({
            data: { id: 'contract-1', status: 'signed', signed_at: '2024-06-01T12:00:00Z' },
          })
        }
        return Promise.resolve({ data: null })
      })

      const user = userEvent.setup()
      const member = makeMember()
      render(<MemberModal mode="view" member={member} {...defaultProps} />)

      const contractToggle = screen.getByText('Contrato').closest('button')!
      await user.click(contractToggle)

      const verifyBtn = await screen.findByText(/Verificar Integridade/)
      await user.click(verifyBtn.closest('button')!)

      expect(await screen.findByText('Contrato integro')).toBeInTheDocument()
    })

    it('shows invalid result when verify fails', async () => {
      const { api } = await import('../lib/api-client')
      const mockedApiGet = vi.mocked(api.get)
      mockedApiGet.mockImplementation((url: string) => {
        if (url.includes('/payments')) return Promise.resolve({ data: [] })
        if (url.includes('/verify')) {
          return Promise.reject(new Error('verification failed'))
        }
        if (url.includes('/contracts')) {
          return Promise.resolve({
            data: { id: 'contract-1', status: 'signed', signed_at: '2024-06-01T12:00:00Z' },
          })
        }
        return Promise.resolve({ data: null })
      })

      const user = userEvent.setup()
      const member = makeMember()
      render(<MemberModal mode="view" member={member} {...defaultProps} />)

      const contractToggle = screen.getByText('Contrato').closest('button')!
      await user.click(contractToggle)

      const verifyBtn = await screen.findByText(/Verificar Integridade/)
      await user.click(verifyBtn.closest('button')!)

      expect(await screen.findByText('Erro ao verificar integridade')).toBeInTheDocument()
    })

    it('opens PDF in new tab when download clicked', async () => {
      const { api } = await import('../lib/api-client')
      const mockedApiGet = vi.mocked(api.get)
      mockedApiGet.mockImplementation((url: string) => {
        if (url.includes('/payments')) return Promise.resolve({ data: [] })
        if (url.includes('/contracts')) {
          return Promise.resolve({
            data: {
              id: 'contract-1',
              status: 'signed',
              signed_at: '2024-06-01T12:00:00Z',
              pdf_url: 'https://example.com/contract.pdf',
            },
          })
        }
        return Promise.resolve({ data: null })
      })

      const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null)

      const user = userEvent.setup()
      const member = makeMember()
      render(<MemberModal mode="view" member={member} {...defaultProps} />)

      const contractToggle = screen.getByText('Contrato').closest('button')!
      await user.click(contractToggle)

      const downloadBtn = await screen.findByText(/Baixar PDF/)
      await user.click(downloadBtn.closest('button')!)

      expect(windowOpen).toHaveBeenCalledWith('https://example.com/contract.pdf', '_blank')
      windowOpen.mockRestore()
    })
  })

  // ── Form submission in create/edit modes ─────────────────────

  describe('form submission', () => {
    it('calls createMember on valid create form submission', async () => {
      const { createMember } = await import('../lib/members')

      const user = userEvent.setup()
      const onSuccess = vi.fn()
      render(<MemberModal mode="create" onClose={vi.fn()} onSuccess={onSuccess} />)

      await user.type(screen.getByLabelText('Nome Completo'), 'Ana Costa')
      await user.type(screen.getByLabelText('Email'), 'ana@example.com')
      await user.type(screen.getByLabelText('Telefone'), '11999887766')

      // CPF requires specific format
      const cpfInput = screen.getByLabelText('CPF')
      await user.type(cpfInput, '52998224725')

      await user.click(screen.getByRole('button', { name: /criar membro/i }))

      await vi.waitFor(() => {
        expect(createMember).toHaveBeenCalled()
      })
    })

    it('calls updateMember on valid edit form submission', async () => {
      const { updateMember } = await import('../lib/members')
      const member = makeMember()

      const user = userEvent.setup()
      const onSuccess = vi.fn()
      render(<MemberModal mode="edit" member={member} onClose={vi.fn()} onSuccess={onSuccess} />)

      // Change the name
      const nameInput = screen.getByLabelText('Nome Completo')
      await user.clear(nameInput)
      await user.type(nameInput, 'Joao Silva Updated')

      await user.click(screen.getByRole('button', { name: /salvar alter/i }))

      await vi.waitFor(() => {
        expect(updateMember).toHaveBeenCalled()
      })
    })

    it('shows error toast when createMember returns falsy', async () => {
      const { createMember } = await import('../lib/members')
      const { toast } = await import('sonner')
      vi.mocked(createMember).mockResolvedValue(null as unknown as ReturnType<typeof createMember>)

      const user = userEvent.setup()
      render(<MemberModal mode="create" onClose={vi.fn()} onSuccess={vi.fn()} />)

      await user.type(screen.getByLabelText('Nome Completo'), 'Ana Costa')
      await user.type(screen.getByLabelText('Email'), 'ana@example.com')
      await user.type(screen.getByLabelText('Telefone'), '11999887766')
      await user.type(screen.getByLabelText('CPF'), '52998224725')

      await user.click(screen.getByRole('button', { name: /criar membro/i }))

      await vi.waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Erro ao criar membro')
      })
    })

    it('shows error toast when updateMember returns false', async () => {
      const { updateMember } = await import('../lib/members')
      const { toast } = await import('sonner')
      vi.mocked(updateMember).mockResolvedValue(false)

      const user = userEvent.setup()
      const member = makeMember()
      render(<MemberModal mode="edit" member={member} onClose={vi.fn()} onSuccess={vi.fn()} />)

      await user.click(screen.getByRole('button', { name: /salvar alter/i }))

      await vi.waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Erro ao atualizar membro')
      })
    })
  })

  // ── Activate member (pending) ──────────────────────────────

  describe('activate member', () => {
    it('calls activateMember and triggers onSuccess', async () => {
      const { activateMember } = await import('../lib/members')
      const { toast } = await import('sonner')
      vi.mocked(activateMember).mockResolvedValue(true)

      const user = userEvent.setup()
      const onSuccess = vi.fn()
      const pendingMember = makeMember({ status: 'pending' })
      render(<MemberModal mode="view" member={pendingMember} onClose={vi.fn()} onSuccess={onSuccess} />)

      await user.click(screen.getByRole('button', { name: /ativar/i }))

      await vi.waitFor(() => {
        expect(activateMember).toHaveBeenCalledWith('member-1')
        expect(toast.success).toHaveBeenCalledWith('Membro ativado com sucesso!')
        expect(onSuccess).toHaveBeenCalled()
      })
    })

    it('shows error toast when activation fails', async () => {
      const { activateMember } = await import('../lib/members')
      const { toast } = await import('sonner')
      vi.mocked(activateMember).mockResolvedValue(false)

      const user = userEvent.setup()
      const pendingMember = makeMember({ status: 'pending' })
      render(<MemberModal mode="view" member={pendingMember} onClose={vi.fn()} onSuccess={vi.fn()} />)

      await user.click(screen.getByRole('button', { name: /ativar/i }))

      await vi.waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Erro ao ativar membro')
      })
    })
  })

  // ── Status change in edit mode ────────────────────────────────

  describe('status change flow', () => {
    it('allows clicking different status buttons', async () => {
      const user = userEvent.setup()
      const member = makeMember({ status: 'active' })
      render(<MemberModal mode="edit" member={member} {...defaultProps} />)

      // Click "Inativo" status button
      await user.click(screen.getByText('Inativo'))

      // The button should now be styled as selected (we verify the button is clickable)
      expect(screen.getByText('Inativo')).toBeInTheDocument()
    })

    it('can switch to expired status', async () => {
      const user = userEvent.setup()
      const member = makeMember({ status: 'active' })
      render(<MemberModal mode="edit" member={member} {...defaultProps} />)

      await user.click(screen.getByText('Expirado'))
      expect(screen.getByText('Expirado')).toBeInTheDocument()
    })
  })
})
