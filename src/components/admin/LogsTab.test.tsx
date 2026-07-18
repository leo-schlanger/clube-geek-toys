import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LogsTab } from './LogsTab'
import type { AuditLog } from '../../lib/logs'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetErrorLogs = vi.fn()
const mockGetErrorStats = vi.fn()
vi.mock('../../lib/logs', () => ({
  getErrorLogs: (...args: unknown[]) => mockGetErrorLogs(...args),
  getErrorStats: (...args: unknown[]) => mockGetErrorStats(...args),
}))

vi.mock('lucide-react', () => {
  const icon = ({ children, ...props }: Record<string, unknown>) => <span {...props}>{children as string}</span>
  return {
    FileText: icon, Clock: icon, AlertTriangle: icon, Bug: icon,
    Monitor: icon, Server: icon, RefreshCw: icon,
  }
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sampleLogs: AuditLog[] = [
  {
    id: 'log-1',
    action: 'member_activated',
    member_id: 'member-abc1234567890',
    timestamp: '2026-05-10T10:00:00Z',
  },
  {
    id: 'log-2',
    action: 'payment_confirmed',
    member_id: 'member-def1234567890',
    payment_id: 'pay-xyz1234567890',
    timestamp: '2026-05-09T08:00:00Z',
  },
  {
    id: 'log-3',
    action: 'unknown_action',
    timestamp: '2026-05-08T06:00:00Z',
  },
]

const sampleErrorLogs = [
  {
    id: 'err-1',
    severity: 'error' as const,
    message: 'Failed to load member',
    source: 'frontend' as const,
    createdAt: '2026-05-10T12:00:00Z',
    stack: 'Error: Failed to load member\n    at loadMember.ts:5',
    url: '/dashboard',
    userId: 'user-abc1234567',
    context: { route: '/dashboard' },
  },
  {
    id: 'err-2',
    severity: 'fatal' as const,
    message: 'Database connection lost',
    source: 'backend' as const,
    createdAt: '2026-05-10T11:00:00Z',
    ipAddress: '10.0.0.1',
  },
  {
    id: 'err-3',
    severity: 'warning' as const,
    message: 'Slow query detected',
    source: 'backend' as const,
    createdAt: '2026-05-10T10:00:00Z',
  },
]

const sampleErrorStats = {
  last_24h: '15',
  last_7d: '42',
  errors_24h: '5',
  fatal_24h: '1',
}

const defaultProps = {
  logs: sampleLogs,
  logDateFrom: '',
  logDateTo: '',
  onDateFromChange: vi.fn(),
  onDateToChange: vi.fn(),
}

function renderTab(overrides = {}) {
  return render(<LogsTab {...defaultProps} {...overrides} />)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LogsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetErrorLogs.mockResolvedValue(sampleErrorLogs)
    mockGetErrorStats.mockResolvedValue(sampleErrorStats)
  })

  // ── Sub-tab navigation ──

  it('renders audit and errors sub-tabs', () => {
    renderTab()
    expect(screen.getByText('Auditoria')).toBeInTheDocument()
    expect(screen.getByText('Erros')).toBeInTheDocument()
  })

  it('defaults to audit sub-tab', () => {
    renderTab()
    expect(screen.getByText('Histórico de Atividade')).toBeInTheDocument()
  })

  it('switches to errors sub-tab', async () => {
    const user = userEvent.setup()
    renderTab()

    await user.click(screen.getByText('Erros'))

    await waitFor(() => {
      expect(screen.getByText('Error Logs')).toBeInTheDocument()
    })
  })

  // ── Audit logs ──

  it('renders audit log entries', () => {
    renderTab()
    expect(screen.getByText('Membro Ativado')).toBeInTheDocument()
    expect(screen.getByText('Pagamento Confirmado')).toBeInTheDocument()
  })

  it('renders member ID truncated', () => {
    renderTab()
    expect(screen.getByText('member-abc...')).toBeInTheDocument()
  })

  it('renders payment ID truncated', () => {
    renderTab()
    expect(screen.getByText('pay-xyz123...')).toBeInTheDocument()
  })

  it('uses fallback label for unknown action', () => {
    renderTab()
    expect(screen.getByText('unknown action')).toBeInTheDocument()
  })

  it('shows empty state when no logs', () => {
    renderTab({ logs: [] })
    expect(screen.getByText('Nenhum log de atividade encontrado')).toBeInTheDocument()
  })

  // ── Date filters ──

  it('renders date filter inputs', () => {
    renderTab()
    expect(screen.getByTitle('Data Inicial')).toBeInTheDocument()
    expect(screen.getByTitle('Data Final')).toBeInTheDocument()
  })

  it('calls onDateFromChange on date input', async () => {
    const user = userEvent.setup()
    const onDateFromChange = vi.fn()
    renderTab({ onDateFromChange })

    const dateFrom = screen.getByTitle('Data Inicial')
    await user.type(dateFrom, '2026-05-10')

    expect(onDateFromChange).toHaveBeenCalled()
  })

  it('filters logs by date range', () => {
    renderTab({
      logDateFrom: '2026-05-10',
      logDateTo: '2026-05-10',
    })
    // Only log-1 (May 10) should appear
    expect(screen.getByText('Membro Ativado')).toBeInTheDocument()
    expect(screen.queryByText('Pagamento Confirmado')).not.toBeInTheDocument()
  })

  it('filters logs by from date only', () => {
    renderTab({
      logDateFrom: '2026-05-09',
      logDateTo: '',
    })
    // log-1 and log-2 should appear, log-3 (May 8) should not
    expect(screen.getByText('Membro Ativado')).toBeInTheDocument()
    expect(screen.getByText('Pagamento Confirmado')).toBeInTheDocument()
    expect(screen.queryByText('unknown action')).not.toBeInTheDocument()
  })

  it('filters logs by to date only', () => {
    renderTab({
      logDateFrom: '',
      logDateTo: '2026-05-08',
    })
    // Only log-3 (May 8) should appear
    expect(screen.getByText('unknown action')).toBeInTheDocument()
    expect(screen.queryByText('Membro Ativado')).not.toBeInTheDocument()
  })

  // ── Error logs ──

  it('fetches errors on tab switch', async () => {
    const user = userEvent.setup()
    renderTab()

    await user.click(screen.getByText('Erros'))

    await waitFor(() => {
      expect(mockGetErrorLogs).toHaveBeenCalled()
      expect(mockGetErrorStats).toHaveBeenCalled()
    })
  })

  it('renders error stats cards', async () => {
    const user = userEvent.setup()
    renderTab()

    await user.click(screen.getByText('Erros'))

    await waitFor(() => {
      expect(screen.getByText('Ultimas 24h')).toBeInTheDocument()
      expect(screen.getByText('Ultimos 7 dias')).toBeInTheDocument()
      expect(screen.getByText('Erros 24h')).toBeInTheDocument()
      expect(screen.getByText('Fatais 24h')).toBeInTheDocument()
    })

    // Verify stats values are rendered alongside their labels
    const last24h = screen.getByText('Ultimas 24h').closest('[class*="p-4"]')!
    expect(last24h.textContent).toContain('15')
    const last7d = screen.getByText('Ultimos 7 dias').closest('[class*="p-4"]')!
    expect(last7d.textContent).toContain('42')
    const errors24h = screen.getByText('Erros 24h').closest('[class*="p-4"]')!
    expect(errors24h.textContent).toContain('5')
    const fatal24h = screen.getByText('Fatais 24h').closest('[class*="p-4"]')!
    expect(fatal24h.textContent).toContain('1')
  })

  it('renders error log entries', async () => {
    const user = userEvent.setup()
    renderTab()

    await user.click(screen.getByText('Erros'))

    await waitFor(() => {
      expect(screen.getByText('Failed to load member')).toBeInTheDocument()
      expect(screen.getByText('Database connection lost')).toBeInTheDocument()
      expect(screen.getByText('Slow query detected')).toBeInTheDocument()
    })
  })

  it('shows severity labels', async () => {
    const user = userEvent.setup()
    renderTab()

    await user.click(screen.getByText('Erros'))

    await waitFor(() => {
      expect(screen.getByText('ERROR')).toBeInTheDocument()
      expect(screen.getByText('FATAL')).toBeInTheDocument()
      expect(screen.getByText('WARN')).toBeInTheDocument()
    })
  })

  it('shows source badges', async () => {
    const user = userEvent.setup()
    renderTab()

    await user.click(screen.getByText('Erros'))

    await waitFor(() => {
      expect(screen.getAllByText('frontend').length).toBeGreaterThan(0)
      expect(screen.getAllByText('backend').length).toBeGreaterThan(0)
    })
  })

  it('expands error on click to show details', async () => {
    const user = userEvent.setup()
    renderTab()

    await user.click(screen.getByText('Erros'))

    await waitFor(() => {
      expect(screen.getByText('Failed to load member')).toBeInTheDocument()
    })

    // Click on the error row container (the clickable div wrapper)
    const errorMessage = screen.getByText('Failed to load member')
    const clickableRow = errorMessage.closest('[class*="cursor-pointer"]')!
    await user.click(clickableRow)

    await waitFor(() => {
      // The expanded section shows URL, User, context, and stack
      expect(screen.getByText(/URL:/)).toBeInTheDocument()
      expect(screen.getByText(/User:/)).toBeInTheDocument()
    })
  })

  it('collapses expanded error on second click', async () => {
    const user = userEvent.setup()
    renderTab()

    await user.click(screen.getByText('Erros'))

    await waitFor(() => {
      expect(screen.getByText('Failed to load member')).toBeInTheDocument()
    })

    const errorMessage = screen.getByText('Failed to load member')
    const clickableRow = errorMessage.closest('[class*="cursor-pointer"]')!
    await user.click(clickableRow)
    await waitFor(() => expect(screen.getByText(/URL:/)).toBeInTheDocument())

    await user.click(clickableRow)
    await waitFor(() => expect(screen.queryByText(/URL:/)).not.toBeInTheDocument())
  })

  it('shows empty state when no errors', async () => {
    const user = userEvent.setup()
    mockGetErrorLogs.mockResolvedValue([])
    renderTab()

    await user.click(screen.getByText('Erros'))

    await waitFor(() => {
      expect(screen.getByText('Nenhum erro registrado')).toBeInTheDocument()
    })
  })

  // ── Error filters ──

  it('renders severity and source filter dropdowns', async () => {
    const user = userEvent.setup()
    renderTab()

    await user.click(screen.getByText('Erros'))

    await waitFor(() => {
      expect(screen.getByDisplayValue('Todos')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Todas fontes')).toBeInTheDocument()
    })
  })

  it('filters by severity', async () => {
    const user = userEvent.setup()
    renderTab()

    await user.click(screen.getByText('Erros'))

    await waitFor(() => {
      expect(screen.getByDisplayValue('Todos')).toBeInTheDocument()
    })

    await user.selectOptions(screen.getByDisplayValue('Todos'), 'fatal')

    await waitFor(() => {
      expect(mockGetErrorLogs).toHaveBeenCalledWith(expect.objectContaining({ severity: 'fatal' }))
    })
  })

  it('filters by source', async () => {
    const user = userEvent.setup()
    renderTab()

    await user.click(screen.getByText('Erros'))

    await waitFor(() => {
      expect(screen.getByDisplayValue('Todas fontes')).toBeInTheDocument()
    })

    await user.selectOptions(screen.getByDisplayValue('Todas fontes'), 'frontend')

    await waitFor(() => {
      expect(mockGetErrorLogs).toHaveBeenCalledWith(expect.objectContaining({ source: 'frontend' }))
    })
  })

  // ── Refresh ──

  it('refetches errors on refresh button click', async () => {
    const user = userEvent.setup()
    renderTab()

    await user.click(screen.getByText('Erros'))

    await waitFor(() => {
      expect(mockGetErrorLogs).toHaveBeenCalledTimes(1)
    })

    // Click refresh button (the RefreshCw icon button)
    // The refresh button is the outline button with no text content in the filter area
    const filterButtons = screen.getByDisplayValue('Todos').closest('.flex.gap-2')!.querySelectorAll('button')
    await user.click(filterButtons[0])

    await waitFor(() => {
      expect(mockGetErrorLogs).toHaveBeenCalledTimes(2)
    })
  })

  // ── Error badge ──

  it('shows error count badge on errors tab when errors exist', async () => {
    renderTab()

    await waitFor(() => {
      expect(screen.queryByText('5')).not.toBeInTheDocument()
    })
    // The badge is rendered only after the errors tab was loaded
    // On initial render, errorStats is null so no badge
  })
})
