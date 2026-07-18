/**
 * hooks/index.ts re-export tests
 *
 * Verifies that the barrel file re-exports all expected hooks.
 */

import { describe, it, expect, vi } from 'vitest'

// Mock dependencies so hooks don't make real API calls on import
vi.mock('../lib/members', () => ({
  getAllMembers: vi.fn().mockResolvedValue([]),
  getMemberById: vi.fn().mockResolvedValue(null),
  updateMember: vi.fn().mockResolvedValue(null),
}))

vi.mock('../lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  membersLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('../lib/api-client', () => ({
  api: { get: vi.fn().mockResolvedValue({ data: [] }), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

describe('hooks/index re-exports', () => {
  it('should export useMembers', async () => {
    const mod = await import('./index')
    expect(mod.useMembers).toBeDefined()
    expect(typeof mod.useMembers).toBe('function')
  })

  it('should export useMember', async () => {
    const mod = await import('./index')
    expect(mod.useMember).toBeDefined()
    expect(typeof mod.useMember).toBe('function')
  })
})
