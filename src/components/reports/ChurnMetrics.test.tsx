import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('recharts', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="chart">{children}</div>
  )
  return {
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
    LineChart: Passthrough,
    Line: () => <div data-testid="line" />,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
  }
})

vi.mock('../../lib/reports', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/reports')>()
  return {
    ...actual,
    calculateGrowthRate: actual.calculateGrowthRate,
  }
})

vi.mock('lucide-react', () => {
  const icon = ({ children, ...props }: Record<string, unknown>) => (
    <span {...props}>{children as string}</span>
  )
  return { AlertTriangle: icon, TrendingDown: icon, TrendingUp: icon, Users: icon }
})

import { ChurnMetrics } from './ChurnMetrics'
import type { ChurnData } from '../../lib/reports'

const sampleData: ChurnData[] = [
  { period: 'Jan/26', churnRate: 2.5, churned: 3, total: 120 },
  { period: 'Feb/26', churnRate: 3.2, churned: 4, total: 125 },
  { period: 'Mar/26', churnRate: 1.8, churned: 2, total: 111 },
]

describe('ChurnMetrics', () => {
  it('renders loading state', () => {
    render(<ChurnMetrics data={[]} loading />)

    expect(screen.getByText(/carregando/i)).toBeInTheDocument()
    expect(screen.getByText(/taxa de churn/i)).toBeInTheDocument()
  })

  it('renders empty state', () => {
    render(<ChurnMetrics data={[]} />)

    expect(screen.getByText(/nenhum dado disponivel/i)).toBeInTheDocument()
  })

  it('renders current churn rate', () => {
    render(<ChurnMetrics data={sampleData} />)

    // Current rate is last entry = 1.8%
    expect(screen.getByText(/1\.8%/)).toBeInTheDocument()
  })

  it('renders total churned', () => {
    render(<ChurnMetrics data={sampleData} />)

    // Total churned = 3 + 4 + 2 = 9
    expect(screen.getByText('9')).toBeInTheDocument()
  })

  it('renders average rate', () => {
    render(<ChurnMetrics data={sampleData} />)

    // Average = (2.5 + 3.2 + 1.8) / 3 = 2.5
    expect(screen.getByText(/2\.5%/)).toBeInTheDocument()
  })

  it('shows health indicator based on average rate', () => {
    render(<ChurnMetrics data={sampleData} />)

    // Average is 2.5, which falls in "Atenção Necessária" range (2-5)
    expect(screen.getByText(/aten/i)).toBeInTheDocument()
  })

  it('shows excellent health for low churn', () => {
    const lowChurnData: ChurnData[] = [
      { period: 'Jan/26', churnRate: 0.5, churned: 1, total: 200 },
      { period: 'Feb/26', churnRate: 0.8, churned: 1, total: 125 },
    ]
    render(<ChurnMetrics data={lowChurnData} />)

    expect(screen.getByText(/excelente/i)).toBeInTheDocument()
  })

  it('shows urgent warning for high churn', () => {
    const highChurnData: ChurnData[] = [
      { period: 'Jan/26', churnRate: 6.0, churned: 12, total: 200 },
      { period: 'Feb/26', churnRate: 7.0, churned: 14, total: 200 },
    ]
    render(<ChurnMetrics data={highChurnData} />)

    expect(screen.getByText(/urgentes/i)).toBeInTheDocument()
  })
})
