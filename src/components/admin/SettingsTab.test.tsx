import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsTab } from './SettingsTab'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetSettings = vi.fn()
const mockUpdateSettings = vi.fn()
vi.mock('../../lib/settings', () => ({
  getSettings: (...args: unknown[]) => mockGetSettings(...args),
  updateSettings: (...args: unknown[]) => mockUpdateSettings(...args),
}))

const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}))

vi.mock('lucide-react', () => {
  const icon = ({ children, ...props }: Record<string, unknown>) => <span {...props}>{children as string}</span>
  return {
    Save: icon, RotateCcw: icon,
    AlertTriangle: icon, Loader2: icon, Database: icon,
  }
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fakeSettings = {
  values: {
    'pricing.club_annual': 149.99,
    'plan.club.discount_products': 15,
    'payment.duplicate_window_days': 3,
  },
  catalogue: [
    { key: 'pricing.club_annual', default: 149.99, type: 'number' as const, description: 'Club annual price' },
  ],
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SettingsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Loading state ──

  it('shows loading spinner initially', () => {
    mockGetSettings.mockReturnValue(new Promise(() => {})) // never resolves
    render(<SettingsTab />)
    // The Loader2 icon should be in the DOM (as a span mock)
    // We check for the spinner container
    const spinnerContainer = document.querySelector('.animate-spin')
    expect(spinnerContainer).toBeInTheDocument()
  })

  // ── Error state ──

  it('shows error when settings fail to load', async () => {
    mockGetSettings.mockResolvedValue(null)
    render(<SettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Falha ao carregar configurações.')).toBeInTheDocument()
    })
    expect(mockToastError).toHaveBeenCalled()
  })

  // ── Loaded state ──

  it('renders plan configuration card after loading', async () => {
    mockGetSettings.mockResolvedValue(fakeSettings)
    render(<SettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Configuração do Plano')).toBeInTheDocument()
    })
  })

  it('renders payment guards section', async () => {
    mockGetSettings.mockResolvedValue(fakeSettings)
    render(<SettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Proteções de Pagamento')).toBeInTheDocument()
    })
  })

  it('renders backup info section', async () => {
    mockGetSettings.mockResolvedValue(fakeSettings)
    render(<SettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Backups')).toBeInTheDocument()
    })
    expect(screen.getByText(/Backups automaticos diarios/)).toBeInTheDocument()
    expect(screen.getByText(/Retencao: 7 dias/)).toBeInTheDocument()
  })

  it('renders info banner', async () => {
    mockGetSettings.mockResolvedValue(fakeSettings)
    render(<SettingsTab />)

    await waitFor(() => {
      expect(screen.getByText(/Configurações persistidas no banco/)).toBeInTheDocument()
    })
  })

  // ── Save / Discard buttons disabled when no changes ──

  it('disables save and discard buttons when no changes', async () => {
    mockGetSettings.mockResolvedValue(fakeSettings)
    render(<SettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Salvar Configurações')).toBeInTheDocument()
    })

    const saveBtn = screen.getByText('Salvar Configurações').closest('button')!
    const discardBtn = screen.getByText('Descartar').closest('button')!
    expect(saveBtn).toBeDisabled()
    expect(discardBtn).toBeDisabled()
  })

  // ── Editing enables save ──

  it('enables save/discard after editing a field', async () => {
    const user = userEvent.setup()
    mockGetSettings.mockResolvedValue(fakeSettings)
    render(<SettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Configuração do Plano')).toBeInTheDocument()
    })

    // Edit the annual price input
    const priceInput = screen.getByDisplayValue('149.99')

    await user.clear(priceInput)
    await user.type(priceInput, '199.99')

    const saveBtn = screen.getByText('Salvar Configurações').closest('button')!
    expect(saveBtn).not.toBeDisabled()
  })

  // ── Save flow ──

  it('saves changes successfully', async () => {
    const user = userEvent.setup()
    mockGetSettings.mockResolvedValue(fakeSettings)
    const updatedValues = { ...fakeSettings.values, 'pricing.club_annual': 199.99 }
    mockUpdateSettings.mockResolvedValue({ values: updatedValues })
    render(<SettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Configuração do Plano')).toBeInTheDocument()
    })

    const priceInput = screen.getByDisplayValue('149.99')
    await user.clear(priceInput)
    await user.type(priceInput, '199.99')

    await user.click(screen.getByText('Salvar Configurações'))

    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalled()
      expect(mockToastSuccess).toHaveBeenCalledWith('Configurações salvas com sucesso!')
    })
  })

  it('only sends changed values on save', async () => {
    const user = userEvent.setup()
    mockGetSettings.mockResolvedValue(fakeSettings)
    mockUpdateSettings.mockResolvedValue({ values: { ...fakeSettings.values, 'payment.duplicate_window_days': 7 } })
    render(<SettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Proteções de Pagamento')).toBeInTheDocument()
    })

    // Change the duplicate payment window
    const windowInput = screen.getByDisplayValue('3')
    await user.clear(windowInput)
    await user.type(windowInput, '7')

    await user.click(screen.getByText('Salvar Configurações'))

    await waitFor(() => {
      const calledWith = mockUpdateSettings.mock.calls[0][0]
      expect(calledWith).toEqual({ 'payment.duplicate_window_days': 7 })
    })
  })

  it('shows error toast on save failure', async () => {
    const user = userEvent.setup()
    mockGetSettings.mockResolvedValue(fakeSettings)
    mockUpdateSettings.mockRejectedValue(new Error('Save failed'))
    render(<SettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Configuração do Plano')).toBeInTheDocument()
    })

    const priceInput = screen.getByDisplayValue('149.99')
    await user.clear(priceInput)
    await user.type(priceInput, '99')

    await user.click(screen.getByText('Salvar Configurações'))

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Save failed')
    })
  })

  // ── Discard flow ──

  it('discards changes on reset', async () => {
    const user = userEvent.setup()
    mockGetSettings.mockResolvedValue(fakeSettings)
    render(<SettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Configuração do Plano')).toBeInTheDocument()
    })

    const priceInput = screen.getByDisplayValue('149.99')
    await user.clear(priceInput)
    await user.type(priceInput, '99')

    await user.click(screen.getByText('Descartar'))

    expect(mockToastSuccess).toHaveBeenCalledWith('Alterações descartadas.')
    // The button should be disabled again
    const saveBtn = screen.getByText('Salvar Configurações').closest('button')!
    expect(saveBtn).toBeDisabled()
  })

  // ── Input types / fields ──

  it('renders annual price and product discount inputs', async () => {
    mockGetSettings.mockResolvedValue(fakeSettings)
    render(<SettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Configuração do Plano')).toBeInTheDocument()
    })

    expect(screen.getByText('Preço Anual (R$)')).toBeInTheDocument()
    expect(screen.getByText('Desconto em Produtos (%)')).toBeInTheDocument()
    expect(screen.getByDisplayValue('149.99')).toBeInTheDocument()
    expect(screen.getByDisplayValue('15')).toBeInTheDocument()
  })

  it('renders duplicate window days input', async () => {
    mockGetSettings.mockResolvedValue(fakeSettings)
    render(<SettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Dias da janela')).toBeInTheDocument()
    })
    expect(screen.getByDisplayValue('3')).toBeInTheDocument()
  })
})
