import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('recharts', () => {
  const Passthrough = ({ children, ...props }: Record<string, unknown>) => (
    <div data-testid={props['data-testid'] as string}>{children as string}</div>
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
    Legend: () => null,
  }
})

vi.mock('lucide-react', () => {
  const icon = ({ children, ...props }: Record<string, unknown>) => (
    <span {...props}>{children as string}</span>
  )
  return { TrendingUp: icon }
})

import { RevenueChart } from './RevenueChart'
import type { MonthlyReportData } from '../../lib/reports'

const sampleData: MonthlyReportData[] = [
  {
    period: '2026-01',
    month: '2026-01',
    revenue: 500,
    paymentCount: 3,
    newMembers: 5,
    churnedMembers: 1,
    shopRevenue: 0,
    shopOrders: 0,
  },
  {
    period: '2026-02',
    month: '2026-02',
    revenue: 800,
    paymentCount: 5,
    newMembers: 8,
    churnedMembers: 2,
    shopRevenue: 100,
    shopOrders: 1,
  },
  {
    period: '2026-03',
    month: '2026-03',
    revenue: 1200,
    paymentCount: 8,
    newMembers: 10,
    churnedMembers: 1,
    shopRevenue: 50,
    shopOrders: 1,
  },
]

describe('RevenueChart', () => {
  it('renders loading state', () => {
    render(<RevenueChart data={[]} loading />)

    expect(screen.getByText(/carregando/i)).toBeInTheDocument()
    expect(screen.getByText(/receita mensal/i)).toBeInTheDocument()
  })

  it('renders empty state when data is empty', () => {
    render(<RevenueChart data={[]} />)

    expect(screen.getByText(/nenhum pagamento confirmado/i)).toBeInTheDocument()
  })

  it('renders chart with data', () => {
    render(<RevenueChart data={sampleData} />)

    expect(screen.getByText(/receita mensal/i)).toBeInTheDocument()
    // Total revenue = 500 + 800 + 1200 = 2500
    expect(screen.getByText(/R\$\s*2\.500,00/)).toBeInTheDocument()
  })

  it('shows the number of months covered', () => {
    render(<RevenueChart data={sampleData} />)

    expect(screen.getByText(/ltimos 3 meses/i)).toBeInTheDocument()
  })

  it('shows average revenue', () => {
    render(<RevenueChart data={sampleData} />)

    expect(screen.getByText(/m[eé]dia/i)).toBeInTheDocument()
  })

  it('renders the responsive container when data exists', () => {
    render(<RevenueChart data={sampleData} />)

    expect(screen.getByTestId('responsive-container')).toBeInTheDocument()
  })
})
