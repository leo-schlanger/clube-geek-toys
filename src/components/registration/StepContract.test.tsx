import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Mock SignaturePad as a class — cannot reference variables outside vi.mock (hoisted)
vi.mock('signature_pad', () => {
  const instance = {
    clear: vi.fn(),
    isEmpty: vi.fn().mockReturnValue(false),
    toDataURL: vi.fn().mockReturnValue('data:image/png;base64,fakesignature'),
    toData: vi.fn().mockReturnValue([]),
    fromData: vi.fn(),
    off: vi.fn(),
  }
  return {
    default: function MockSignaturePad() { return instance },
    __mockInstance: instance,
  }
})

vi.mock('../../data/contract-content', () => ({
  CONTRACT_SECTIONS: [
    { title: 'Clausula 1', content: ['Texto da clausula 1.'] },
    { title: 'Clausula 2', content: ['Texto da clausula 2.'] },
  ],
  CONTRACT_TITLE: 'CLUBE GEEKPOP & TOYS',
  CONTRACT_SUBTITLE: 'REGULAMENTO E TERMO DE ADESAO',
}))

vi.mock('../../lib/utils', () => ({
  formatCurrency: (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

const mockGenerateContractPDF = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]))
const mockPdfToBase64 = vi.fn().mockReturnValue('base64pdf')
const mockDownloadPDF = vi.fn()
vi.mock('../../lib/contract-generator', () => ({
  generateContractPDF: (...args: unknown[]) => mockGenerateContractPDF(...args),
  pdfToBase64: (...args: unknown[]) => mockPdfToBase64(...args),
  downloadPDF: (...args: unknown[]) => mockDownloadPDF(...args),
}))

const mockStoreContract = vi.fn().mockResolvedValue({ pdfUrl: 'https://example.com/contract.pdf' })
vi.mock('../../lib/contract-storage', () => ({
  storeContract: (...args: unknown[]) => mockStoreContract(...args),
}))

const mockGenerateContractHash = vi.fn().mockResolvedValue('sha256-hash-abc')
const mockGetClientIP = vi.fn().mockResolvedValue('192.168.1.1')
const mockGetUserAgent = vi.fn().mockReturnValue('TestBrowser/1.0')
const mockFormatTimestamp = vi.fn().mockReturnValue('11/05/2026 10:00')
vi.mock('../../lib/signature-utils', () => ({
  generateContractHash: (...args: unknown[]) => mockGenerateContractHash(...args),
  getClientIP: (...args: unknown[]) => mockGetClientIP(...args),
  getUserAgent: (...args: unknown[]) => mockGetUserAgent(...args),
  formatTimestamp: (...args: unknown[]) => mockFormatTimestamp(...args),
}))

const mockSendContractEmail = vi.fn().mockResolvedValue(undefined)
vi.mock('../../lib/email', () => ({
  sendContractEmail: (...args: unknown[]) => mockSendContractEmail(...args),
}))

vi.mock('../../lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
const mockToastLoading = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
    loading: (...args: unknown[]) => mockToastLoading(...args),
  },
}))

vi.mock('lucide-react', () => {
  const icon = ({ children, ...props }: Record<string, unknown>) => (
    <span {...props}>{children as string}</span>
  )
  return {
    Check: icon, RotateCcw: icon, Download: icon, Loader2: icon,
    ArrowLeft: icon, ArrowRight: icon, ChevronDown: icon, Shield: icon,
  }
})

import { StepContract } from './StepContract'
import * as sigPadModule from 'signature_pad'

// Get the mock instance from the module
const mockSignaturePadInstance = (sigPadModule as unknown as { __mockInstance: {
  clear: ReturnType<typeof vi.fn>
  isEmpty: ReturnType<typeof vi.fn>
  toDataURL: ReturnType<typeof vi.fn>
  toData: ReturnType<typeof vi.fn>
  fromData: ReturnType<typeof vi.fn>
  off: ReturnType<typeof vi.fn>
} }).__mockInstance

// ─── Helpers ────────────────────────────────────────────────────────────────

const defaultProps = {
  memberId: 'member-123',
  memberName: 'Joao Silva',
  memberCPF: '12345678901',
  memberEmail: 'joao@test.com',
  memberPhone: '11999998888',
  plan: 'club' as const,
  paymentType: 'annual' as const,
  onSigned: vi.fn(),
  onBack: vi.fn(),
}

// Mock scrollTo and scrollIntoView
Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo
Element.prototype.scrollIntoView = vi.fn()

// Mock canvas context
function mockCanvasContext() {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    scale: vi.fn(),
    fillStyle: '',
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn(),
    putImageData: vi.fn(),
    createImageData: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    arc: vi.fn(),
    measureText: vi.fn().mockReturnValue({ width: 0 }),
    transform: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext

  // Mock getBoundingClientRect for container
  Element.prototype.getBoundingClientRect = vi.fn().mockReturnValue({
    width: 400,
    height: 200,
    top: 0,
    left: 0,
    right: 400,
    bottom: 200,
    x: 0,
    y: 0,
    toJSON: vi.fn(),
  })
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('StepContract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockCanvasContext()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── Step 1: Read ──────────────────────────────────────────────────────

  describe('Step 1: Read', () => {
    it('renders contract title and subtitle', () => {
      render(<StepContract {...defaultProps} />)

      expect(screen.getByText('CLUBE GEEKPOP & TOYS')).toBeInTheDocument()
      expect(screen.getByText('REGULAMENTO E TERMO DE ADESAO')).toBeInTheDocument()
    })

    it('renders member info', () => {
      render(<StepContract {...defaultProps} />)

      expect(screen.getByText(/joao silva/i)).toBeInTheDocument()
      expect(screen.getByText(/123\.456\.789-01/)).toBeInTheDocument()
      expect(screen.getByText('joao@test.com')).toBeInTheDocument()
      expect(screen.getByText('11999998888')).toBeInTheDocument()
    })

    it('renders contract sections', () => {
      render(<StepContract {...defaultProps} />)

      expect(screen.getByText('Clausula 1')).toBeInTheDocument()
      expect(screen.getByText('Texto da clausula 1.')).toBeInTheDocument()
      expect(screen.getByText('Clausula 2')).toBeInTheDocument()
    })

    it('renders plan badge with price', () => {
      render(<StepContract {...defaultProps} />)

      expect(screen.getAllByText('Clube GeekPop & Toys').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText(/anual/i)).toBeInTheDocument()
      expect(screen.getByText(/149,99/)).toBeInTheDocument()
    })

    it('renders terms and privacy checkboxes', () => {
      render(<StepContract {...defaultProps} />)

      expect(screen.getByText(/li e concordo com todos os termos/i)).toBeInTheDocument()
      // Privacy text is split across elements (contains an <a> tag)
      const privacyLabel = screen.getByText((_, element) => {
        return element?.tagName === 'SPAN' &&
          !!element.textContent?.includes('Política de Privacidade')
      })
      expect(privacyLabel).toBeInTheDocument()
    })

    it('disables continue button until both checkboxes are checked', () => {
      render(<StepContract {...defaultProps} />)

      const continueButton = screen.getByRole('button', { name: /continuar para assinatura/i })
      expect(continueButton).toBeDisabled()
    })

    it('enables continue button when both checkboxes are checked', async () => {
      vi.useRealTimers()
      const user = userEvent.setup()
      render(<StepContract {...defaultProps} />)

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(checkboxes[1])

      const continueButton = screen.getByRole('button', { name: /continuar para assinatura/i })
      expect(continueButton).not.toBeDisabled()
    })

    it('shows toast when clicking continue without accepting terms', async () => {
      vi.useRealTimers()
      const user = userEvent.setup()
      render(<StepContract {...defaultProps} />)

      // Click on the wrapper div that triggers handleDisabledContinueClick
      const continueButton = screen.getByRole('button', { name: /continuar para assinatura/i })
      await user.click(continueButton.closest('div')!)

      expect(mockToastError).toHaveBeenCalled()
    })

    it('calls onBack when back button is clicked', async () => {
      vi.useRealTimers()
      const user = userEvent.setup()
      render(<StepContract {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /voltar/i }))
      expect(defaultProps.onBack).toHaveBeenCalledTimes(1)
    })

    it('renders step 1 of 3 indicator', () => {
      render(<StepContract {...defaultProps} />)

      expect(screen.getByText(/passo 1 de 3/i)).toBeInTheDocument()
    })

    it('renders header title "Contrato de Adesao"', () => {
      render(<StepContract {...defaultProps} />)

      expect(screen.getByText(/contrato de ades/i)).toBeInTheDocument()
    })
  })

  // ── Step 2: Sign ──────────────────────────────────────────────────────

  describe('Step 2: Sign', () => {
    async function goToSignStep() {
      vi.useRealTimers()
      const user = userEvent.setup()
      render(<StepContract {...defaultProps} />)

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(checkboxes[1])
      await user.click(screen.getByRole('button', { name: /continuar para assinatura/i }))

      // Wait for the canvas to be set up (setTimeout in useEffect)
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /confirmar assinatura/i })).not.toBeDisabled()
      }, { timeout: 3000 })

      return user
    }

    it('navigates to sign step and shows signature prompt', async () => {
      await goToSignStep()

      expect(screen.getByText(/desenhe sua assinatura/i)).toBeInTheDocument()
      expect(screen.getByText(/passo 2 de 3/i)).toBeInTheDocument()
    })

    it('renders the canvas element', async () => {
      await goToSignStep()

      const canvas = document.querySelector('canvas')
      expect(canvas).not.toBeNull()
    })

    it('renders clear and confirm buttons', async () => {
      await goToSignStep()

      expect(screen.getByRole('button', { name: /limpar/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /confirmar assinatura/i })).toBeInTheDocument()
    })

    it('renders back button to return to read step', async () => {
      const user = await goToSignStep()

      await user.click(screen.getByRole('button', { name: /voltar/i }))

      expect(screen.getByText(/contrato de ades/i)).toBeInTheDocument()
    })

    it('shows error toast if signature is empty on confirm', async () => {
      mockSignaturePadInstance.isEmpty.mockReturnValueOnce(true)
      const user = await goToSignStep()

      await user.click(screen.getByRole('button', { name: /confirmar assinatura/i }))

      expect(mockToastError).toHaveBeenCalledWith('Desenhe sua assinatura')
    })

    it('legal notice about Lei 14.063/2020 is visible', async () => {
      await goToSignStep()

      // There are two elements mentioning Lei 14.063 (info box + bottom text)
      expect(screen.getAllByText(/lei 14.063/i).length).toBeGreaterThanOrEqual(1)
    })
  })

  // ── Step 3: Confirm ───────────────────────────────────────────────────

  describe('Step 3: Confirm', () => {
    async function goToConfirmStep() {
      vi.useRealTimers()
      const user = userEvent.setup()
      render(<StepContract {...defaultProps} />)

      // Step 1: Accept terms
      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(checkboxes[1])
      await user.click(screen.getByRole('button', { name: /continuar para assinatura/i }))

      // Step 2: Wait for canvas and confirm signature
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /confirmar assinatura/i })).not.toBeDisabled()
      }, { timeout: 3000 })
      await user.click(screen.getByRole('button', { name: /confirmar assinatura/i }))

      return user
    }

    it('navigates to confirm step and shows review text', async () => {
      await goToConfirmStep()

      expect(screen.getByText(/revise e finalize/i)).toBeInTheDocument()
      expect(screen.getByText(/passo 3 de 3/i)).toBeInTheDocument()
    })

    it('shows the signature preview image', async () => {
      await goToConfirmStep()

      const img = screen.getByAltText('Assinatura')
      expect(img).toBeInTheDocument()
      expect(img.getAttribute('src')).toBe('data:image/png;base64,fakesignature')
    })

    it('shows member details summary', async () => {
      await goToConfirmStep()

      expect(screen.getByText('Joao Silva')).toBeInTheDocument()
      expect(screen.getByText(/123\.456\.789-01/)).toBeInTheDocument()
      expect(screen.getAllByText('Clube GeekPop & Toys').length).toBeGreaterThanOrEqual(1)
    })

    it('has finalizar contrato button', async () => {
      await goToConfirmStep()

      expect(screen.getByRole('button', { name: /finalizar contrato/i })).toBeInTheDocument()
    })

    it('has PDF download button', async () => {
      await goToConfirmStep()

      expect(screen.getByRole('button', { name: /pdf/i })).toBeInTheDocument()
    })

    it('calls processContract and onSigned on finalize', async () => {
      const user = await goToConfirmStep()

      await user.click(screen.getByRole('button', { name: /finalizar contrato/i }))

      await waitFor(() => {
        expect(mockStoreContract).toHaveBeenCalled()
        expect(mockToastSuccess).toHaveBeenCalledWith(
          expect.stringContaining('sucesso'),
          expect.any(Object),
        )
        expect(defaultProps.onSigned).toHaveBeenCalledTimes(1)
      })
    })

    it('handles PDF generation failure during processContract', async () => {
      mockGenerateContractPDF.mockRejectedValueOnce(new Error('PDF failed'))
      const user = await goToConfirmStep()

      await user.click(screen.getByRole('button', { name: /finalizar contrato/i }))

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalled()
      })

      // onSigned should NOT be called
      expect(defaultProps.onSigned).not.toHaveBeenCalled()
    })

    it('handles contract storage failure with retries', async () => {
      mockStoreContract.mockRejectedValue(new Error('Storage failed'))
      const user = await goToConfirmStep()

      await user.click(screen.getByRole('button', { name: /finalizar contrato/i }))

      await waitFor(() => {
        // Should have been called 3 times (max retries)
        expect(mockStoreContract).toHaveBeenCalledTimes(3)
        expect(mockToastError).toHaveBeenCalled()
      }, { timeout: 15000 })

      expect(defaultProps.onSigned).not.toHaveBeenCalled()
    })

    it('can go back to sign step from confirm', async () => {
      const user = await goToConfirmStep()

      await user.click(screen.getByRole('button', { name: /voltar/i }))

      expect(screen.getByText(/desenhe sua assinatura/i)).toBeInTheDocument()
    })

    it('handles PDF download', async () => {
      const user = await goToConfirmStep()

      await user.click(screen.getByRole('button', { name: /pdf/i }))

      await waitFor(() => {
        expect(mockGenerateContractPDF).toHaveBeenCalled()
        expect(mockDownloadPDF).toHaveBeenCalled()
      })
    })
  })

  // ── CPF formatting ────────────────────────────────────────────────────

  it('formats CPF with dots and dash', () => {
    render(<StepContract {...defaultProps} />)

    expect(screen.getByText(/123\.456\.789-01/)).toBeInTheDocument()
  })
})
