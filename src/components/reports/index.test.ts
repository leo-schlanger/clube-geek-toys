/**
 * reports/index.ts re-export tests
 *
 * Verifies that the barrel file re-exports all expected report components.
 */

import { describe, it, expect, vi } from 'vitest'

// Mock recharts since chart components import it
vi.mock('recharts', () => ({
  LineChart: () => null,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => children,
  Legend: () => null,
  BarChart: () => null,
  Bar: () => null,
  PieChart: () => null,
  Pie: () => null,
  Cell: () => null,
  AreaChart: () => null,
  Area: () => null,
}))

vi.mock('../../lib/reports', () => ({
  calculateGrowthRate: vi.fn().mockReturnValue(0),
}))

vi.mock('../../lib/utils', () => ({
  formatCurrency: vi.fn((v: number) => `R$ ${v.toFixed(2)}`),
  cn: vi.fn((...args: string[]) => args.join(' ')),
}))

describe('reports/index re-exports', () => {
  it('should export RevenueChart', async () => {
    const mod = await import('./index')
    expect(mod.RevenueChart).toBeDefined()
    expect(typeof mod.RevenueChart).toBe('function')
  })

  it('should export MembersChart', async () => {
    const mod = await import('./index')
    expect(mod.MembersChart).toBeDefined()
    expect(typeof mod.MembersChart).toBe('function')
  })

  it('should export ChurnMetrics', async () => {
    const mod = await import('./index')
    expect(mod.ChurnMetrics).toBeDefined()
    expect(typeof mod.ChurnMetrics).toBe('function')
  })

  it('should export ReportFilters', async () => {
    const mod = await import('./index')
    expect(mod.ReportFilters).toBeDefined()
    expect(typeof mod.ReportFilters).toBe('function')
  })
})
