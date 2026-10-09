/**
 * ReportsTab Component Tests
 *
 * ReportsTab composes ReportFilters, RevenueChart, MembersChart,
 * and ChurnMetrics. We mock all sub-components and verify
 * structure and prop forwarding.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReportsTab } from './ReportsTab'
import type { MonthlyReportData, PlanDistribution, ChurnData } from '../../lib/reports'

// ── Mock sub-components to isolate ReportsTab logic ──────────

vi.mock('../reports', () => ({
  RevenueChart: ({ loading }: { loading: boolean }) => (
    <div data-testid="revenue-chart">{loading ? 'loading' : 'revenue'}</div>
  ),
  MembersChart: ({ loading }: { loading: boolean }) => (
    <div data-testid="members-chart">{loading ? 'loading' : 'members'}</div>
  ),
  ChurnMetrics: ({ loading }: { loading: boolean }) => (
    <div data-testid="churn-metrics">{loading ? 'loading' : 'churn'}</div>
  ),
  ReportFilters: ({ selectedPeriod, refreshing }: { selectedPeriod: number; refreshing?: boolean }) => (
    <div data-testid="report-filters">period: {selectedPeriod}, refreshing: {String(!!refreshing)}</div>
  ),
}))

// ── Test data ────────────────────────────────────────────────

const sampleMonthlyData: MonthlyReportData[] = [
  {
    period: '2025-01',
    month: '2025-01',
    revenue: 1000,
    paymentCount: 7,
    newMembers: 5,
    churnedMembers: 1,
    shopRevenue: 0,
    shopOrders: 0,
    ticketRevenue: 0,
    ticketCount: 0,
  },
]

const samplePlanDist: PlanDistribution[] = [
  { plan: 'club', count: 20, revenue: 2999, percentage: 100 },
]

const sampleChurnData: ChurnData[] = [
  { period: '2025-01', churnRate: 5, churned: 1, total: 20 },
]

// ── Tests ────────────────────────────────────────────────────

describe('ReportsTab', () => {
  const defaultProps = {
    reportPeriod: 6,
    monthlyReportData: sampleMonthlyData,
    planDistribution: samplePlanDist,
    churnData: sampleChurnData,
    loadingReports: false,
    onPeriodChange: vi.fn(),
    onRefresh: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render all sub-components', () => {
    render(<ReportsTab {...defaultProps} />)
    expect(screen.getByTestId('report-filters')).toBeInTheDocument()
    expect(screen.getByTestId('revenue-chart')).toBeInTheDocument()
    expect(screen.getByTestId('members-chart')).toBeInTheDocument()
    expect(screen.getByTestId('churn-metrics')).toBeInTheDocument()
  })

  // The charts drawn from an empty list said "nenhum pagamento" during an outage.
  it('shows the failure instead of charts that would read as no sales', async () => {
    const onRefresh = vi.fn()
    render(<ReportsTab {...defaultProps} monthlyReportData={[]} reportsError="Erro ao carregar o relatório mensal" onRefresh={onRefresh} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar os relatórios')
    expect(screen.getByRole('alert')).toHaveTextContent('não quer dizer que não houve vendas')
    expect(screen.queryByTestId('revenue-chart')).not.toBeInTheDocument()
    expect(screen.queryByTestId('churn-metrics')).not.toBeInTheDocument()
    screen.getByRole('button', { name: 'Tentar de novo' }).click()
    expect(onRefresh).toHaveBeenCalled()
  })

  it('should pass period to ReportFilters', () => {
    render(<ReportsTab {...defaultProps} reportPeriod={12} />)
    expect(screen.getByTestId('report-filters')).toHaveTextContent('period: 12')
  })

  it('should pass loading state to all chart components', () => {
    render(<ReportsTab {...defaultProps} loadingReports={true} />)
    expect(screen.getByTestId('revenue-chart')).toHaveTextContent('loading')
    expect(screen.getByTestId('members-chart')).toHaveTextContent('loading')
    expect(screen.getByTestId('churn-metrics')).toHaveTextContent('loading')
  })

  it('should show non-loading state when loadingReports is false', () => {
    render(<ReportsTab {...defaultProps} loadingReports={false} />)
    expect(screen.getByTestId('revenue-chart')).toHaveTextContent('revenue')
    expect(screen.getByTestId('members-chart')).toHaveTextContent('members')
    expect(screen.getByTestId('churn-metrics')).toHaveTextContent('churn')
  })

  it('should pass refreshing state to ReportFilters', () => {
    render(<ReportsTab {...defaultProps} loadingReports={true} />)
    expect(screen.getByTestId('report-filters')).toHaveTextContent('refreshing: true')
  })

  it('should render with empty data arrays', () => {
    render(
      <ReportsTab
        {...defaultProps}
        monthlyReportData={[]}
        planDistribution={[]}
        churnData={[]}
      />,
    )
    expect(screen.getByTestId('revenue-chart')).toBeInTheDocument()
    expect(screen.getByTestId('members-chart')).toBeInTheDocument()
    expect(screen.getByTestId('churn-metrics')).toBeInTheDocument()
  })
})
