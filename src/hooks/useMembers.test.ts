import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useMembers, useMember } from './useMembers'
import type { Member } from '../types'

// Mock the members API module
vi.mock('../lib/members', () => ({
  getAllMembers: vi.fn(),
  getMemberById: vi.fn(),
  updateMember: vi.fn(),
}))

// Mock the logger
vi.mock('../lib/logger', () => ({
  membersLogger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

// Import mocked functions for control
import { getAllMembers, getMemberById, updateMember as updateMemberApi } from '../lib/members'

const mockGetAllMembers = getAllMembers as ReturnType<typeof vi.fn>
const mockGetMemberById = getMemberById as ReturnType<typeof vi.fn>
const mockUpdateMember = updateMemberApi as ReturnType<typeof vi.fn>

const fakeMember: Member = {
  id: 'm1',
  userId: 'u1',
  cpf: '12345678901',
  fullName: 'John Doe',
  email: 'john@test.com',
  phone: '11999999999',
  plan: 'silver',
  status: 'active',
  paymentType: 'pix',
  startDate: '2026-01-01',
  expiryDate: '2026-07-01',
  points: 100,
  paymentCount: 2,
}

const fakeMember2: Member = {
  ...fakeMember,
  id: 'm2',
  userId: 'u2',
  fullName: 'Jane Smith',
  email: 'jane@test.com',
}

describe('useMembers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAllMembers.mockResolvedValue([fakeMember, fakeMember2])
  })

  it('should auto-fetch members on mount by default', async () => {
    const { result } = renderHook(() => useMembers())

    expect(result.current.loading).toBe(true)
    expect(result.current.members).toEqual([])
    expect(result.current.error).toBeNull()

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.members).toEqual([fakeMember, fakeMember2])
    expect(mockGetAllMembers).toHaveBeenCalledTimes(1)
  })

  it('should not auto-fetch when autoFetch is false', async () => {
    const { result } = renderHook(() => useMembers({ autoFetch: false }))

    // Give it a tick
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(mockGetAllMembers).not.toHaveBeenCalled()
    expect(result.current.members).toEqual([])
  })

  it('should set error on fetch failure', async () => {
    mockGetAllMembers.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useMembers())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBe('Network error')
    expect(result.current.members).toEqual([])
  })

  it('should set default error message for non-Error throws', async () => {
    mockGetAllMembers.mockRejectedValue('something')

    const { result } = renderHook(() => useMembers())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBe('Erro ao carregar membros')
  })

  it('refetch should reload members', async () => {
    const { result } = renderHook(() => useMembers())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    mockGetAllMembers.mockResolvedValue([fakeMember])

    await act(async () => {
      await result.current.refetch()
    })

    expect(result.current.members).toEqual([fakeMember])
    expect(mockGetAllMembers).toHaveBeenCalledTimes(2)
  })

  it('getMember should return a member by id', async () => {
    mockGetMemberById.mockResolvedValue(fakeMember)

    const { result } = renderHook(() => useMembers({ autoFetch: false }))

    let member: Member | null = null
    await act(async () => {
      member = await result.current.getMember('m1')
    })

    expect(member).toEqual(fakeMember)
    expect(mockGetMemberById).toHaveBeenCalledWith('m1')
  })

  it('getMember should return null on error', async () => {
    mockGetMemberById.mockRejectedValue(new Error('Not found'))

    const { result } = renderHook(() => useMembers({ autoFetch: false }))

    let member: Member | null = null
    await act(async () => {
      member = await result.current.getMember('invalid')
    })

    expect(member).toBeNull()
  })

  it('updateMember should update local state on success', async () => {
    mockUpdateMember.mockResolvedValue(true)

    const { result } = renderHook(() => useMembers())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    let success = false
    await act(async () => {
      success = await result.current.updateMember('m1', { fullName: 'Updated Name' })
    })

    expect(success).toBe(true)
    expect(result.current.members[0].fullName).toBe('Updated Name')
    expect(result.current.members[1].fullName).toBe('Jane Smith')
  })

  it('updateMember should not update local state on API failure', async () => {
    mockUpdateMember.mockResolvedValue(false)

    const { result } = renderHook(() => useMembers())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    let success = false
    await act(async () => {
      success = await result.current.updateMember('m1', { fullName: 'Should Not Update' })
    })

    expect(success).toBe(false)
    expect(result.current.members[0].fullName).toBe('John Doe')
  })

  it('updateMember should return false on exception', async () => {
    mockUpdateMember.mockRejectedValue(new Error('Server error'))

    const { result } = renderHook(() => useMembers())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    let success = false
    await act(async () => {
      success = await result.current.updateMember('m1', { fullName: 'Crash' })
    })

    expect(success).toBe(false)
  })
})

describe('useMember', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch member by id on mount', async () => {
    mockGetMemberById.mockResolvedValue(fakeMember)

    const { result } = renderHook(() => useMember('m1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.member).toEqual(fakeMember)
    expect(result.current.error).toBeNull()
    expect(mockGetMemberById).toHaveBeenCalledWith('m1')
  })

  it('should set member to null when id is null', async () => {
    const { result } = renderHook(() => useMember(null))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.member).toBeNull()
    expect(mockGetMemberById).not.toHaveBeenCalled()
  })

  it('should set error on fetch failure', async () => {
    mockGetMemberById.mockRejectedValue(new Error('Fetch failed'))

    const { result } = renderHook(() => useMember('m1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBe('Fetch failed')
    expect(result.current.member).toBeNull()
  })

  it('should set default error message for non-Error throws', async () => {
    mockGetMemberById.mockRejectedValue('oops')

    const { result } = renderHook(() => useMember('m1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBe('Erro ao carregar membro')
  })

  it('should refetch when id changes', async () => {
    mockGetMemberById.mockResolvedValue(fakeMember)

    const { result, rerender } = renderHook(
      ({ id }) => useMember(id),
      { initialProps: { id: 'm1' as string | null } }
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.member).toEqual(fakeMember)

    mockGetMemberById.mockResolvedValue(fakeMember2)
    rerender({ id: 'm2' })

    await waitFor(() => {
      expect(result.current.member).toEqual(fakeMember2)
    })

    expect(mockGetMemberById).toHaveBeenCalledTimes(2)
  })

  it('refetch should reload the member', async () => {
    mockGetMemberById.mockResolvedValue(fakeMember)

    const { result } = renderHook(() => useMember('m1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    const updated = { ...fakeMember, fullName: 'Updated' }
    mockGetMemberById.mockResolvedValue(updated)

    await act(async () => {
      await result.current.refetch()
    })

    expect(result.current.member).toEqual(updated)
  })
})
