/**
 * admin/index.ts re-export tests
 *
 * Verifies that the barrel file re-exports all expected admin components.
 */

import { describe, it, expect, vi } from 'vitest'

// Mock child dependencies so we can import the barrel without side effects
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), loading: vi.fn(), warning: vi.fn() },
}))

vi.mock('../../hooks/useConfirm', () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true),
}))

vi.mock('../../lib/api-client', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

vi.mock('../../lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('../../lib/settings', () => ({
  getSettings: vi.fn().mockResolvedValue({}),
  updateSettings: vi.fn().mockResolvedValue({}),
}))

vi.mock('../../lib/logs', () => ({
  getLogs: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '1', email: 'admin@test.com', role: 'admin' },
    token: 'test-token',
  }),
}))

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

describe('admin/index re-exports', () => {
  // The first dynamic import compiles the whole barrel graph (tabs + charts) on a cold
  // cache, which can exceed the default 5s in an isolated run — allow extra headroom.
  it('should export MembersTab', async () => {
    const mod = await import('./index')
    expect(mod.MembersTab).toBeDefined()
    expect(typeof mod.MembersTab).toBe('function')
  }, 20000)

  it('should export UsersTab', async () => {
    const mod = await import('./index')
    expect(mod.UsersTab).toBeDefined()
    expect(typeof mod.UsersTab).toBe('function')
  }, 20000)

  it('should export LogsTab', async () => {
    const mod = await import('./index')
    expect(mod.LogsTab).toBeDefined()
    expect(typeof mod.LogsTab).toBe('function')
  }, 20000)

  it('should export ReportsTab', async () => {
    const mod = await import('./index')
    expect(mod.ReportsTab).toBeDefined()
    expect(typeof mod.ReportsTab).toBe('function')
  }, 20000)
})
