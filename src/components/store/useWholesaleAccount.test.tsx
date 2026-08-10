import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../../lib/wholesale', () => ({
  getMyWholesaleAccount: vi.fn(),
}))

import { useAuth } from '../../contexts/AuthContext'
import { getMyWholesaleAccount } from '../../lib/wholesale'
import { useWholesaleAccount } from './useWholesaleAccount'

const mockedAuth = vi.mocked(useAuth)
const mockedGet = vi.mocked(getMyWholesaleAccount)

describe('useWholesaleAccount', () => {
  beforeEach(() => vi.clearAllMocks())

  it('clears account when logged out', async () => {
    mockedAuth.mockReturnValue({
      user: null,
      loading: false,
    } as ReturnType<typeof useAuth>)
    const { result } = renderHook(() => useWholesaleAccount())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.account).toBeNull()
    expect(result.current.isApproved).toBe(false)
  })

  it('loads approved account', async () => {
    mockedAuth.mockReturnValue({
      user: { id: 'u1', email: 'a@b.com', role: 'member', emailVerified: true },
      loading: false,
    } as ReturnType<typeof useAuth>)
    mockedGet.mockResolvedValue({
      id: 'w1',
      userId: 'u1',
      cnpj: '11222333000181',
      companyName: 'Co',
      tradeName: null,
      stateRegistration: null,
      phone: null,
      contactName: 'A',
      businessActivity: null,
      status: 'approved',
      rejectionReason: null,
      reviewedBy: null,
      reviewedAt: null,
      adminNotes: null,
      createdAt: '',
      updatedAt: '',
    })
    const { result } = renderHook(() => useWholesaleAccount())
    await waitFor(() => expect(result.current.isApproved).toBe(true))
    expect(result.current.account?.cnpj).toBe('11222333000181')
  })

  it('handles pending status', async () => {
    mockedAuth.mockReturnValue({
      user: { id: 'u1', email: 'a@b.com', role: 'member', emailVerified: true },
      loading: false,
    } as ReturnType<typeof useAuth>)
    mockedGet.mockResolvedValue({
      id: 'w1',
      userId: 'u1',
      cnpj: '11222333000181',
      companyName: 'Co',
      tradeName: null,
      stateRegistration: null,
      phone: null,
      contactName: 'A',
      businessActivity: null,
      status: 'pending',
      rejectionReason: null,
      reviewedBy: null,
      reviewedAt: null,
      adminNotes: null,
      createdAt: '',
      updatedAt: '',
    })
    const { result } = renderHook(() => useWholesaleAccount())
    await waitFor(() => expect(result.current.isPending).toBe(true))
  })
})
