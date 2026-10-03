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
// Stubbed so these tests stay about the settings form — the card talks to the
// API on mount and has its own suite in MelhorEnvioCard.test.tsx.
vi.mock('./MelhorEnvioCard', () => ({
  MelhorEnvioCard: () => <div data-testid="melhor-envio-card" />,
}))

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}))

vi.mock('lucide-react', () => {
  const icon = ({ children, ...props }: Record<string, unknown>) => (
    <span {...props}>{children as string}</span>
  )
  return {
    Save: icon,
    RotateCcw: icon,
    AlertTriangle: icon,
    Loader2: icon,
    Database: icon,
    Palette: icon,
    Building2: icon,
    BadgePercent: icon,
    Bell: icon,
    Moon: icon,
    Sun: icon,
    Monitor: icon,
  }
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fakeSettings = {
  values: {
    'payment.duplicate_window_days': 3,
    'shop.online_discount_enabled': true,
    'shop.online_discount_percent': 5,
    'shop.online_discount_banner_enabled': true,
    'shop.online_discount_banner_text': 'No site é 5% mais barato',
    'notifications.admin_payment_inapp': true,
    'notifications.admin_payment_email': false,
    'notifications.admin_payment_min_amount': 50,
  },
  catalogue: [
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

    const priceInput = screen.getByDisplayValue('3')

    await user.clear(priceInput)
    await user.type(priceInput, '199.99')

    const saveBtn = screen.getByText('Salvar Configurações').closest('button')!
    expect(saveBtn).not.toBeDisabled()
  })

  // ── Save flow ──

  it('saves changes successfully', async () => {
    const user = userEvent.setup()
    mockGetSettings.mockResolvedValue(fakeSettings)
    const updatedValues = { ...fakeSettings.values, 'payment.duplicate_window_days': 199 }
    mockUpdateSettings.mockResolvedValue({ values: updatedValues })
    render(<SettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Configuração do Plano')).toBeInTheDocument()
    })

    const priceInput = screen.getByDisplayValue('3')
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

    const priceInput = screen.getByDisplayValue('3')
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

    const priceInput = screen.getByDisplayValue('3')
    await user.clear(priceInput)
    await user.type(priceInput, '99')

    await user.click(screen.getByText('Descartar'))

    expect(mockToastSuccess).toHaveBeenCalledWith('Alterações descartadas.')
    // The button should be disabled again
    const saveBtn = screen.getByText('Salvar Configurações').closest('button')!
    expect(saveBtn).toBeDisabled()
  })

  // ── Input types / fields ──

  it('shows the plan price and the member discount as fixed, not editable', async () => {
    mockGetSettings.mockResolvedValue(fakeSettings)
    render(<SettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Configuração do Plano')).toBeInTheDocument()
    })

    // Neither is a setting: the contract and the Terms fix both.
    expect(screen.getByText('Preço do plano')).toBeInTheDocument()
    expect(screen.getByText(/R\$\s*159,90\/ano/)).toBeInTheDocument()
    expect(screen.queryByDisplayValue('159.9')).not.toBeInTheDocument()
    // The discount is not a setting: nothing reads one, and the Terms fix 10%.
    expect(screen.getByText('Desconto do membro na loja')).toBeInTheDocument()
    expect(screen.getByText('10%')).toBeInTheDocument()
    expect(screen.queryByText('Desconto em Produtos (%)')).not.toBeInTheDocument()
  })

  it('renders duplicate window days input', async () => {
    mockGetSettings.mockResolvedValue(fakeSettings)
    render(<SettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Dias da janela')).toBeInTheDocument()
    })
    expect(screen.getByDisplayValue('3')).toBeInTheDocument()
  })

  // The Coupons tab sends staff here for the site promotion; the card has to exist.
  it('mostra a promoção da loja online com os valores salvos', async () => {
    mockGetSettings.mockResolvedValue(fakeSettings)
    render(<SettingsTab />)

    expect(await screen.findByText('Promoção da loja online')).toBeInTheDocument()
    expect(screen.getByLabelText('Desconto (%)')).toHaveValue(5)
    expect(screen.getByLabelText('Texto do aviso')).toHaveValue('No site é 5% mais barato')
    expect(screen.getByRole('checkbox', { name: 'Promoção ligada' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Mandar e-mail' })).not.toBeChecked()
    expect(screen.getByLabelText('Só mandar e-mail a partir de (R$)')).toHaveValue(50)
  })

  it('salva só a chave da promoção que mudou', async () => {
    const user = userEvent.setup()
    mockGetSettings.mockResolvedValue(fakeSettings)
    mockUpdateSettings.mockResolvedValue({
      values: { ...fakeSettings.values, 'shop.online_discount_percent': 8 },
    })
    render(<SettingsTab />)

    const percent = await screen.findByLabelText('Desconto (%)')
    await user.clear(percent)
    await user.type(percent, '8')
    await user.click(screen.getByText('Salvar Configurações'))

    await waitFor(() =>
      expect(mockUpdateSettings).toHaveBeenCalledWith({ 'shop.online_discount_percent': 8 })
    )
  })
})
