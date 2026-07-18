/**
 * ContractModal Component Tests
 *
 * Covers: step rendering (read/sign/confirm), checkbox acceptance,
 * contract content display, progress bar, member data display,
 * and step navigation.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContractModal } from './ContractModal'

// ── Mocks ──────────────────────────────────────────────────────

// Mock signature_pad — must be a real constructor (used with `new`)
vi.mock('signature_pad', () => {
  class MockSignaturePad {
    clear = vi.fn()
    isEmpty = vi.fn().mockReturnValue(true)
    toDataURL = vi.fn().mockReturnValue('data:image/png;base64,mock')
    toData = vi.fn().mockReturnValue([])
    fromData = vi.fn()
    off = vi.fn()
    on = vi.fn()
    constructor(_canvas: HTMLCanvasElement, _opts?: unknown) {
      // noop
    }
  }
  return { default: MockSignaturePad }
})

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

// Mock contract generation libs
vi.mock('../lib/contract-generator', () => ({
  generateContractPDF: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  pdfToBase64: vi.fn().mockReturnValue('base64data'),
  downloadPDF: vi.fn(),
}))

vi.mock('../lib/contract-storage', () => ({
  storeContract: vi.fn().mockResolvedValue({ pdfUrl: 'https://example.com/contract.pdf' }),
}))

vi.mock('../lib/signature-utils', () => ({
  generateContractHash: vi.fn().mockResolvedValue('sha256-mock-hash'),
  getClientIP: vi.fn().mockResolvedValue('127.0.0.1'),
  getUserAgent: vi.fn().mockReturnValue('TestBrowser/1.0'),
  formatTimestamp: vi.fn().mockReturnValue('11/05/2026 14:30:00'),
}))

vi.mock('../lib/email', () => ({
  sendContractEmail: vi.fn().mockResolvedValue(undefined),
}))

// Mock contract content
vi.mock('../data/contract-content', () => ({
  CONTRACT_TITLE: 'CLUBE GEEKPOP & TOYS',
  CONTRACT_SUBTITLE: 'REGULAMENTO E TERMO DE ADESÃO',
  CONTRACT_SECTIONS: [
    {
      title: '1. SOBRE O CLUBE',
      content: ['O CLUBE GEEKPOP & TOYS é um programa de fidelidade.'],
    },
    {
      title: '2. PLANOS',
      content: ['PLANO SILVER: 10% de desconto.'],
    },
  ],
}))

// ── DOM polyfills for jsdom ────────────────────────────────────

// jsdom doesn't implement scrollTo or scrollIntoView
beforeAll(() => {
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo
  Element.prototype.scrollIntoView = vi.fn()
  HTMLElement.prototype.scrollTo = vi.fn() as unknown as typeof HTMLElement.prototype.scrollTo
})

// ── Test helpers ──────────────────────────────────────────────

const defaultProps = {
  memberId: 'member-1',
  memberName: 'João Silva',
  memberCPF: '529.982.247-25',
  memberEmail: 'joao@example.com',
  memberPhone: '(11) 99999-8888',
  plan: 'club' as const,
  paymentType: 'annual' as const,
  onClose: vi.fn(),
  onSigned: vi.fn(),
}

// ── Tests ─────────────────────────────────────────────────────

describe('ContractModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Step 1: Read ───────────────────────────────────────────

  describe('step 1: read contract', () => {
    it('renders the contract title', () => {
      render(<ContractModal {...defaultProps} />)
      expect(screen.getByText('CLUBE GEEKPOP & TOYS')).toBeInTheDocument()
    })

    it('renders the contract subtitle', () => {
      render(<ContractModal {...defaultProps} />)
      expect(screen.getByText('REGULAMENTO E TERMO DE ADESÃO')).toBeInTheDocument()
    })

    it('renders step header', () => {
      render(<ContractModal {...defaultProps} />)
      expect(screen.getByText('Contrato de Adesão')).toBeInTheDocument()
      expect(screen.getByText('Passo 1 de 3')).toBeInTheDocument()
    })

    it('renders member data summary', () => {
      render(<ContractModal {...defaultProps} />)
      expect(screen.getByText(/João Silva/)).toBeInTheDocument()
      expect(screen.getByText(/529\.982\.247-25/)).toBeInTheDocument()
      expect(screen.getByText('joao@example.com')).toBeInTheDocument()
      expect(screen.getByText('(11) 99999-8888')).toBeInTheDocument()
    })

    it('renders the single club plan badge', () => {
      render(<ContractModal {...defaultProps} />)
      expect(screen.getByText('Clube GeekPop & Toys')).toBeInTheDocument()
    })

    it('shows the annual payment type', () => {
      render(<ContractModal {...defaultProps} />)
      expect(screen.getByText(/Anual/)).toBeInTheDocument()
    })

    it('renders contract sections', () => {
      render(<ContractModal {...defaultProps} />)
      expect(screen.getByText('1. SOBRE O CLUBE')).toBeInTheDocument()
      expect(screen.getByText('2. PLANOS')).toBeInTheDocument()
      expect(screen.getByText(/programa de fidelidade/)).toBeInTheDocument()
    })

    it('renders end-of-regulation marker', () => {
      render(<ContractModal {...defaultProps} />)
      expect(screen.getByText(/Fim do Regulamento/)).toBeInTheDocument()
    })

    it('renders terms checkbox', () => {
      render(<ContractModal {...defaultProps} />)
      expect(screen.getByText(/Li e concordo com todos os termos/)).toBeInTheDocument()
    })

    it('renders privacy checkbox', () => {
      render(<ContractModal {...defaultProps} />)
      expect(screen.getByText(/Política de Privacidade/)).toBeInTheDocument()
    })

    it('continue button is disabled until both checkboxes checked', () => {
      render(<ContractModal {...defaultProps} />)
      const continueBtn = screen.getByRole('button', { name: /continuar para assinatura/i })
      expect(continueBtn).toBeDisabled()
    })

    it('continue button enables after both checkboxes checked', async () => {
      const user = userEvent.setup()
      render(<ContractModal {...defaultProps} />)

      const checkboxes = screen.getAllByRole('checkbox')
      // First two checkboxes are terms and privacy
      await user.click(checkboxes[0])
      await user.click(checkboxes[1])

      const continueBtn = screen.getByRole('button', { name: /continuar para assinatura/i })
      expect(continueBtn).toBeEnabled()
    })

    it('shows "Obrigatório" badge', () => {
      render(<ContractModal {...defaultProps} />)
      expect(screen.getByText('Obrigatório')).toBeInTheDocument()
    })
  })

  // ── Step navigation ────────────────────────────────────────

  describe('step navigation', () => {
    it('advances to sign step when continue clicked', async () => {
      const user = userEvent.setup()
      render(<ContractModal {...defaultProps} />)

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(checkboxes[1])

      const continueBtn = screen.getByRole('button', { name: /continuar para assinatura/i })
      await user.click(continueBtn)

      expect(screen.getByText('Assinatura Digital')).toBeInTheDocument()
      expect(screen.getByText('Passo 2 de 3')).toBeInTheDocument()
    })

    it('shows sign step content (signature instructions)', async () => {
      const user = userEvent.setup()
      render(<ContractModal {...defaultProps} />)

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(checkboxes[1])
      await user.click(screen.getByRole('button', { name: /continuar para assinatura/i }))

      expect(screen.getByText('Desenhe sua Assinatura')).toBeInTheDocument()
      expect(screen.getByText(/mouse ou toque na tela/)).toBeInTheDocument()
    })

    it('shows data collection notice on sign step', async () => {
      const user = userEvent.setup()
      render(<ContractModal {...defaultProps} />)

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(checkboxes[1])
      await user.click(screen.getByRole('button', { name: /continuar para assinatura/i }))

      // "Lei 14.063/2020" appears in both the data notice and the footer text
      const leiElements = screen.getAllByText(/Lei 14.063\/2020/)
      expect(leiElements.length).toBeGreaterThanOrEqual(1)
      // The data collection notice specifically mentions IP/SHA-256
      expect(screen.getByText(/SHA-256/)).toBeInTheDocument()
    })

    it('shows back button on sign step', async () => {
      const user = userEvent.setup()
      render(<ContractModal {...defaultProps} />)

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(checkboxes[1])
      await user.click(screen.getByRole('button', { name: /continuar para assinatura/i }))

      expect(screen.getByRole('button', { name: /voltar/i })).toBeInTheDocument()
    })

    it('shows clear/limpar button on sign step', async () => {
      const user = userEvent.setup()
      render(<ContractModal {...defaultProps} />)

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(checkboxes[1])
      await user.click(screen.getByRole('button', { name: /continuar para assinatura/i }))

      expect(screen.getByRole('button', { name: /limpar/i })).toBeInTheDocument()
    })

    it('navigates back from sign to read step', async () => {
      const user = userEvent.setup()
      render(<ContractModal {...defaultProps} />)

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(checkboxes[1])
      await user.click(screen.getByRole('button', { name: /continuar para assinatura/i }))

      expect(screen.getByText('Assinatura Digital')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /voltar/i }))

      expect(screen.getByText('Contrato de Adesão')).toBeInTheDocument()
    })
  })

  // ── Progress bar ───────────────────────────────────────────

  describe('progress bar', () => {
    it('renders three progress segments', () => {
      const { container } = render(<ContractModal {...defaultProps} />)
      const segments = container.querySelectorAll('.h-1\\.5.flex-1.rounded-full')
      expect(segments.length).toBe(3)
    })
  })

  // ── Overlay ────────────────────────────────────────────────

  describe('overlay behavior', () => {
    it('shows error toast on overlay click (contract is required)', async () => {
      const { toast } = await import('sonner')
      const user = userEvent.setup()
      const { container } = render(<ContractModal {...defaultProps} />)

      const overlay = container.querySelector('.bg-black\\/70')!
      await user.click(overlay)

      expect(toast.error).toHaveBeenCalledWith(
        'Você precisa assinar o contrato para continuar',
        expect.any(Object)
      )
    })
  })

  // ── Plan / price display ───────────────────────────────────

  describe('plan and price display', () => {
    it('shows the annual club price (R$ 149,99)', () => {
      render(<ContractModal {...defaultProps} />)
      expect(screen.getByText(/R\$\s*149,99/)).toBeInTheDocument()
    })

    it('always shows the single club plan (no Silver/Gold/Black)', () => {
      render(<ContractModal {...defaultProps} />)
      expect(screen.getByText('Clube GeekPop & Toys')).toBeInTheDocument()
      expect(screen.queryByText('Silver')).not.toBeInTheDocument()
      expect(screen.queryByText('Gold')).not.toBeInTheDocument()
      expect(screen.queryByText('Black')).not.toBeInTheDocument()
    })
  })
})
