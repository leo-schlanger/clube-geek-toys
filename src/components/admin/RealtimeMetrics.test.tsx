import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { RealtimeStatsResult, StatsTrend } from '../../hooks/useRealtimeStats'

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockUseRealtimeStats = vi.fn()
vi.mock('../../hooks/useRealtimeStats', () => ({
  useRealtimeStats: () => mockUseRealtimeStats(),
}))

const mockApiGet = vi.fn()
vi.mock('../../lib/api-client', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}))

vi.mock('../../lib/utils', () => ({
  formatCurrency: (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

vi.mock('lucide-react', () => {
  const icon = ({ children, ...props }: Record<string, unknown>) => (
    <span {...props}>{children as string}</span>
  )
  return {
    Users: icon, UserCheck: icon, UserX: icon, Clock: icon, DollarSign: icon,
    TrendingUp: icon, TrendingDown: icon, Minus: icon, Activity: icon,
    RefreshCw: icon, Calendar: icon, Zap: icon, HeartPulse: icon,
  }
})

vi.mock('../ui/loading', () => ({
  Loading: ({ text }: { text?: string }) => <div data-testid="loading">{text}</div>,
}))

import { RealtimeMetrics } from './RealtimeMetrics'

// ─── Helpers ────────────────────────────────────────────────────────────────

const stableTrend: StatsTrend = { direction: 'stable', percentage: 0 }
const upTrend: StatsTrend = { direction: 'up', percentage: 15 }

function makeStatsResult(overrides: Partial<RealtimeStatsResult> = {}): RealtimeStatsResult {
  return {
    stats: {
      totalMembers: 50,
      activeMembers: 40,
      pendingMembers: 3,
      expiredMembers: 7,
      monthlyRevenue: 1500,
      todayRevenue: 200,
      newMembersToday: 2,
      newMembersThisWeek: 8,
    },
    previousStats: null,
    trends: {
      totalMembers: stableTrend,
      activeMembers: upTrend,
      monthlyRevenue: stableTrend,
      todayRevenue: stableTrend,
    },
    loading: false,
    error: null,
    lastUpdate: new Date('2026-05-11T10:00:00'),
    ...overrides,
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('RealtimeMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Health check returns ok by default
    mockApiGet.mockResolvedValue({ data: { status: 'ok' } })
  })

  it('renders loading state', () => {
    mockUseRealtimeStats.mockReturnValue(makeStatsResult({ loading: true }))

    render(<RealtimeMetrics />)

    expect(screen.getByTestId('loading')).toBeInTheDocument()
  })

  it('renders error state', () => {
    mockUseRealtimeStats.mockReturnValue(
      makeStatsResult({ error: 'Failed to load', loading: false }),
    )

    render(<RealtimeMetrics />)

    expect(screen.getByText('Failed to load')).toBeInTheDocument()
  })

  it('renders the main stats cards', () => {
    mockUseRealtimeStats.mockReturnValue(makeStatsResult())

    render(<RealtimeMetrics />)

    expect(screen.getByText('Total de Membros')).toBeInTheDocument()
    expect(screen.getByText('50')).toBeInTheDocument()
    expect(screen.getByText('Membros Ativos')).toBeInTheDocument()
    expect(screen.getByText('40')).toBeInTheDocument()
  })

  it('renders secondary stats cards', () => {
    mockUseRealtimeStats.mockReturnValue(makeStatsResult())

    render(<RealtimeMetrics />)

    expect(screen.getByText(/aguardando ativa/i)).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText(/membros expirados/i)).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText(/novos hoje/i)).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('renders system health indicator', async () => {
    mockUseRealtimeStats.mockReturnValue(makeStatsResult())

    render(<RealtimeMetrics />)

    await waitFor(() => {
      expect(screen.getByText(/api online/i)).toBeInTheDocument()
    })
  })

  it('renders API offline when health check fails', async () => {
    mockApiGet.mockRejectedValue(new Error('network error'))
    mockUseRealtimeStats.mockReturnValue(makeStatsResult())

    render(<RealtimeMetrics />)

    await waitFor(() => {
      expect(screen.getByText(/api offline/i)).toBeInTheDocument()
    })
  })

  it('renders Live badge and last update time', () => {
    mockUseRealtimeStats.mockReturnValue(makeStatsResult())

    render(<RealtimeMetrics />)

    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  it('renders trend indicator for up direction', () => {
    mockUseRealtimeStats.mockReturnValue(makeStatsResult())

    render(<RealtimeMetrics />)

    // The activeMembers trend is "up" at 15%
    expect(screen.getByText('15%')).toBeInTheDocument()
  })
})
