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
    BarChart: Passthrough,
    Bar: () => <div data-testid="bar" />,
    PieChart: Passthrough,
    Pie: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="pie">{children}</div>
    ),
    Cell: () => <div data-testid="cell" />,
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
  return { Users: icon }
})

import { MembersChart } from './MembersChart'
import type { MonthlyReportData } from '../../lib/reports'

const sampleData: MonthlyReportData[] = [
  { period: 'Jan/26', month: '2026-01', revenue: 500, newMembers: 5, churnedMembers: 1 },
  { period: 'Feb/26', month: '2026-02', revenue: 800, newMembers: 8, churnedMembers: 2 },
]

describe('MembersChart', () => {
  it('renders loading state', () => {
    render(<MembersChart data={[]} loading />)

    expect(screen.getByText(/carregando/i)).toBeInTheDocument()
  })

  it('renders empty state for bar chart when no data', () => {
    render(<MembersChart data={[]} />)

    expect(screen.getAllByText(/nenhum dado disponivel/i).length).toBeGreaterThanOrEqual(1)
  })

  it('renders the bar chart with data', () => {
    render(<MembersChart data={sampleData} />)

    // Total new members = 5 + 8 = 13
    expect(screen.getByText('13')).toBeInTheDocument()
    expect(screen.getByText(/novos membros/i)).toBeInTheDocument()
  })
})
