import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../../lib/members', () => ({
  getMemberByUserId: vi.fn(),
  isMemberActive: vi.fn(),
}))

import { useAuth } from '../../contexts/AuthContext'
import { getMemberByUserId, isMemberActive } from '../../lib/members'
import { useShopMember } from './useShopMember'

const mockedAuth = vi.mocked(useAuth)
const mockedGet = vi.mocked(getMemberByUserId)
const mockedActive = vi.mocked(isMemberActive)

describe('useShopMember', () => {
  beforeEach(() => vi.clearAllMocks())

  it('no member when logged out', async () => {
    mockedAuth.mockReturnValue({ user: null, loading: false } as ReturnType<typeof useAuth>)
    const { result } = renderHook(() => useShopMember())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isMember).toBe(false)
  })

  it('detects active member', async () => {
    mockedAuth.mockReturnValue({
      user: { id: 'u1', email: 'a@b.com', role: 'member', emailVerified: true },
      loading: false,
    } as ReturnType<typeof useAuth>)
    const member = { id: 'm1', status: 'active' } as Awaited<ReturnType<typeof getMemberByUserId>>
    mockedGet.mockResolvedValue(member)
    mockedActive.mockReturnValue(true)
    const { result } = renderHook(() => useShopMember())
    await waitFor(() => expect(result.current.isMember).toBe(true))
  })
})
