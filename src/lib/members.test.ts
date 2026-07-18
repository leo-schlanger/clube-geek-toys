/**
 * Members API client — Unit Tests
 *
 * Tests all exported functions from members.ts.
 * Mocks the api-client module to verify correct endpoints, params, and return values.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Member, MemberFormData, PendingPaymentInfo } from '../types'

// Mock api-client before importing the module under test
vi.mock('./api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import { api } from './api-client'
import {
  getMemberByCPF,
  isCPFRegistered,
  getMemberByUserId,
  getMemberById,
  getAllMembers,
  getMembersPaginated,
  getMembersCount,
  createMember,
  updateMember,
  activateMember,
  isMemberActive,
  getMemberDiscount,
  savePendingPayment,
  clearPendingPayment,
} from './members'

const mockedApi = vi.mocked(api)

// ---- Fixtures ----

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: 'member-1',
    userId: 'user-1',
    cpf: '52998224725',
    fullName: 'John Doe',
    email: 'john@example.com',
    phone: '11999999999',
    plan: 'club',
    status: 'active',
    paymentType: 'annual',
    startDate: '2026-01-01T00:00:00Z',
    expiryDate: '2027-01-01T00:00:00Z',
    paymentCount: 3,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

// ============================================
// Tests
// ============================================

describe('Members API client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---- getMemberByCPF ----

  describe('getMemberByCPF', () => {
    it('should call GET /members/by-cpf/:cpf with cleaned CPF', async () => {
      const member = makeMember()
      mockedApi.get.mockResolvedValue({ data: member, status: 200 })

      const result = await getMemberByCPF('529.982.247-25')

      expect(mockedApi.get).toHaveBeenCalledWith('/members/by-cpf/52998224725')
      expect(result).toEqual(member)
    })

    it('should strip non-digit characters from CPF', async () => {
      mockedApi.get.mockResolvedValue({ data: makeMember(), status: 200 })

      await getMemberByCPF('123.456.789-09')

      expect(mockedApi.get).toHaveBeenCalledWith('/members/by-cpf/12345678909')
    })

    it('should return null when no member found', async () => {
      mockedApi.get.mockResolvedValue({ data: undefined, status: 404 })

      const result = await getMemberByCPF('52998224725')

      expect(result).toBeNull()
    })
  })

  // ---- isCPFRegistered ----

  describe('isCPFRegistered', () => {
    it('should call GET /members/cpf-exists/:cpf with skipAuth', async () => {
      mockedApi.get.mockResolvedValue({ data: { exists: true }, status: 200 })

      const result = await isCPFRegistered('529.982.247-25')

      expect(mockedApi.get).toHaveBeenCalledWith('/members/cpf-exists/52998224725', { skipAuth: true })
      expect(result).toBe(true)
    })

    it('should return false when CPF does not exist', async () => {
      mockedApi.get.mockResolvedValue({ data: { exists: false }, status: 200 })

      const result = await isCPFRegistered('12345678909')

      expect(result).toBe(false)
    })

    it('should return false when data is undefined', async () => {
      mockedApi.get.mockResolvedValue({ data: undefined, status: 200 })

      const result = await isCPFRegistered('52998224725')

      expect(result).toBe(false)
    })
  })

  // ---- getMemberByUserId ----

  describe('getMemberByUserId', () => {
    it('should call GET /members/me', async () => {
      const member = makeMember()
      mockedApi.get.mockResolvedValue({ data: member, status: 200 })

      const result = await getMemberByUserId('user-1')

      expect(mockedApi.get).toHaveBeenCalledWith('/members/me')
      expect(result).toEqual(member)
    })

    it('should work without userId argument', async () => {
      const member = makeMember()
      mockedApi.get.mockResolvedValue({ data: member, status: 200 })

      const result = await getMemberByUserId()

      expect(mockedApi.get).toHaveBeenCalledWith('/members/me')
      expect(result).toEqual(member)
    })

    it('should return null when no data', async () => {
      mockedApi.get.mockResolvedValue({ data: undefined, status: 404 })

      const result = await getMemberByUserId()

      expect(result).toBeNull()
    })
  })

  // ---- getMemberById ----

  describe('getMemberById', () => {
    it('should call GET /members/:id', async () => {
      const member = makeMember({ id: 'abc-123' })
      mockedApi.get.mockResolvedValue({ data: member, status: 200 })

      const result = await getMemberById('abc-123')

      expect(mockedApi.get).toHaveBeenCalledWith('/members/abc-123')
      expect(result).toEqual(member)
    })

    it('should return null when member not found', async () => {
      mockedApi.get.mockResolvedValue({ data: undefined, status: 404 })

      const result = await getMemberById('nonexistent')

      expect(result).toBeNull()
    })
  })

  // ---- getAllMembers ----

  describe('getAllMembers', () => {
    it('should call GET /members?limit=1000 and return members array', async () => {
      const members = [makeMember({ id: '1' }), makeMember({ id: '2' })]
      mockedApi.get.mockResolvedValue({ data: { members, total: 2 }, status: 200 })

      const result = await getAllMembers()

      expect(mockedApi.get).toHaveBeenCalledWith('/members?limit=1000')
      expect(result).toEqual(members)
    })

    it('should return empty array when data is undefined', async () => {
      mockedApi.get.mockResolvedValue({ data: undefined, status: 200 })

      const result = await getAllMembers()

      expect(result).toEqual([])
    })

    it('should return empty array when members is undefined', async () => {
      mockedApi.get.mockResolvedValue({ data: { total: 0 }, status: 200 })

      const result = await getAllMembers()

      expect(result).toEqual([])
    })
  })

  // ---- getMembersPaginated ----

  describe('getMembersPaginated', () => {
    it('should call GET /members with pagination params', async () => {
      const members = [makeMember()]
      mockedApi.get.mockResolvedValue({ data: { members, total: 50, page: 1 }, status: 200 })

      const result = await getMembersPaginated(10, 1)

      expect(mockedApi.get).toHaveBeenCalledWith('/members?limit=10&page=1')
      expect(result.data).toEqual(members)
      expect(result.totalCount).toBe(50)
      expect(result.hasMore).toBe(true)
    })

    it('should use default pagination (20 per page, page 1)', async () => {
      mockedApi.get.mockResolvedValue({ data: { members: [], total: 0, page: 1 }, status: 200 })

      await getMembersPaginated()

      expect(mockedApi.get).toHaveBeenCalledWith('/members?limit=20&page=1')
    })

    it('should set hasMore=false when on last page', async () => {
      const members = [makeMember()]
      mockedApi.get.mockResolvedValue({ data: { members, total: 5, page: 1 }, status: 200 })

      const result = await getMembersPaginated(10, 1)

      expect(result.hasMore).toBe(false)
    })

    it('should set hasMore=true when more pages exist', async () => {
      const members = Array(10).fill(null).map((_, i) => makeMember({ id: `m-${i}` }))
      mockedApi.get.mockResolvedValue({ data: { members, total: 25, page: 1 }, status: 200 })

      const result = await getMembersPaginated(10, 1)

      // page * pageSize = 10 < 25
      expect(result.hasMore).toBe(true)
    })

    it('should handle undefined data gracefully', async () => {
      mockedApi.get.mockResolvedValue({ data: undefined, status: 200 })

      const result = await getMembersPaginated(10, 1)

      expect(result.data).toEqual([])
      expect(result.totalCount).toBe(0)
      expect(result.hasMore).toBe(false)
    })
  })

  // ---- getMembersCount ----

  describe('getMembersCount', () => {
    it('should call GET /members/count and return count', async () => {
      mockedApi.get.mockResolvedValue({ data: { count: 42 }, status: 200 })

      const result = await getMembersCount()

      expect(mockedApi.get).toHaveBeenCalledWith('/members/count')
      expect(result).toBe(42)
    })

    it('should return 0 when data is undefined', async () => {
      mockedApi.get.mockResolvedValue({ data: undefined, status: 200 })

      const result = await getMembersCount()

      expect(result).toBe(0)
    })
  })

  // ---- createMember ----

  describe('createMember', () => {
    it('should POST /members with cleaned CPF and form data', async () => {
      const formData: MemberFormData = {
        cpf: '529.982.247-25',
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: '(11) 99999-9999',
        plan: 'club',
        paymentType: 'annual',
      }
      const member = makeMember({ cpf: '52998224725', fullName: 'Jane Doe' })
      mockedApi.post.mockResolvedValue({ data: member, status: 201 })

      const result = await createMember('user-1', formData)

      expect(mockedApi.post).toHaveBeenCalledWith('/members', {
        cpf: '52998224725',
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: '(11) 99999-9999',
        plan: 'club',
        paymentType: 'annual',
      })
      expect(result).toEqual(member)
    })

    it('should return null when API returns no data', async () => {
      const formData: MemberFormData = {
        cpf: '52998224725',
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: '11999999999',
        plan: 'club',
        paymentType: 'annual',
      }
      mockedApi.post.mockResolvedValue({ data: undefined, status: 400 })

      const result = await createMember('user-1', formData)

      expect(result).toBeNull()
    })
  })

  // ---- updateMember ----

  describe('updateMember', () => {
    it('should PATCH /members/:id with partial data and return true on success', async () => {
      mockedApi.patch.mockResolvedValue({ data: {}, status: 200 })

      const result = await updateMember('member-1', { fullName: 'Updated Name' })

      expect(mockedApi.patch).toHaveBeenCalledWith('/members/member-1', { fullName: 'Updated Name' })
      expect(result).toBe(true)
    })

    it('should return false when API returns an error', async () => {
      mockedApi.patch.mockResolvedValue({ error: 'Not found', status: 404 })

      const result = await updateMember('member-1', { fullName: 'Nope' })

      expect(result).toBe(false)
    })
  })

  // ---- activateMember ----

  describe('activateMember', () => {
    it('should call updateMember with status active', async () => {
      mockedApi.patch.mockResolvedValue({ data: {}, status: 200 })

      const result = await activateMember('member-1')

      expect(mockedApi.patch).toHaveBeenCalledWith('/members/member-1', { status: 'active' })
      expect(result).toBe(true)
    })

    it('should return false if patch fails', async () => {
      mockedApi.patch.mockResolvedValue({ error: 'Server error', status: 500 })

      const result = await activateMember('member-1')

      expect(result).toBe(false)
    })
  })

  // ---- isMemberActive ----

  describe('isMemberActive', () => {
    it('should return true for active member with future expiry', () => {
      const member = makeMember({
        status: 'active',
        expiryDate: '2099-12-31T23:59:59Z',
      })

      expect(isMemberActive(member)).toBe(true)
    })

    it('should return false for active member with past expiry', () => {
      const member = makeMember({
        status: 'active',
        expiryDate: '2020-01-01T00:00:00Z',
      })

      expect(isMemberActive(member)).toBe(false)
    })

    it('should return false for inactive member with future expiry', () => {
      const member = makeMember({
        status: 'inactive',
        expiryDate: '2099-12-31T23:59:59Z',
      })

      expect(isMemberActive(member)).toBe(false)
    })

    it('should return false for pending member', () => {
      const member = makeMember({
        status: 'pending',
        expiryDate: '2099-12-31T23:59:59Z',
      })

      expect(isMemberActive(member)).toBe(false)
    })

    it('should return false for expired member', () => {
      const member = makeMember({
        status: 'expired',
        expiryDate: '2020-01-01T00:00:00Z',
      })

      expect(isMemberActive(member)).toBe(false)
    })
  })

  // ---- getMemberDiscount ----

  describe('getMemberDiscount', () => {
    it('deve retornar 15 (desconto único do clube)', () => {
      expect(getMemberDiscount()).toBe(15)
    })

    it('deve retornar sempre o mesmo valor', () => {
      expect(getMemberDiscount()).toBe(getMemberDiscount())
    })
  })

  // ---- savePendingPayment ----

  describe('savePendingPayment', () => {
    it('should update member with pendingPayment data', async () => {
      mockedApi.patch.mockResolvedValue({ data: {}, status: 200 })
      const paymentInfo: PendingPaymentInfo = {
        paymentId: 'pay-123',
        qrCode: 'emv-code-here',
        amount: 39.90,
        expiresAt: '2026-06-01T00:00:00Z',
        createdAt: '2026-05-01T00:00:00Z',
      }

      const result = await savePendingPayment('member-1', paymentInfo)

      expect(mockedApi.patch).toHaveBeenCalledWith('/members/member-1', {
        pendingPayment: paymentInfo,
      })
      expect(result).toBe(true)
    })
  })

  // ---- clearPendingPayment ----

  describe('clearPendingPayment', () => {
    it('should update member with null pendingPayment', async () => {
      mockedApi.patch.mockResolvedValue({ data: {}, status: 200 })

      const result = await clearPendingPayment('member-1')

      expect(mockedApi.patch).toHaveBeenCalledWith('/members/member-1', {
        pendingPayment: null,
      })
      expect(result).toBe(true)
    })
  })
})
