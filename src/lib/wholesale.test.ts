import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}))

import { api } from './api-client'
import {
  registerWholesale,
  loginWholesale,
  getMyWholesaleAccount,
  adminListWholesaleAccounts,
  adminReviewWholesale,
} from './wholesale'

const mockedApi = vi.mocked(api)

const account = {
  id: 'wa-1',
  userId: 'u-1',
  cnpj: '11222333000181',
  companyName: 'Loja Geek LTDA',
  tradeName: 'Geek',
  stateRegistration: null,
  phone: null,
  contactName: 'Ana',
  businessActivity: 'Revenda de artigos geek',
  status: 'pending' as const,
  rejectionReason: null,
  reviewedBy: null,
  reviewedAt: null,
  adminNotes: null,
  email: 'ana@example.com',
  createdAt: '2026-08-10T00:00:00Z',
  updatedAt: '2026-08-10T00:00:00Z',
}

describe('wholesale API client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registerWholesale posts and returns auth result', async () => {
    mockedApi.post.mockResolvedValue({
      data: { account, accessToken: 'a', refreshToken: 'r' },
      status: 201,
    })
    const res = await registerWholesale({
      email: 'ana@example.com',
      password: 'senha12345',
      cnpj: '11222333000181',
      companyName: 'Loja Geek LTDA',
      contactName: 'Ana',
    })
    expect(mockedApi.post).toHaveBeenCalledWith(
      '/wholesale/register',
      expect.objectContaining({ email: 'ana@example.com' }),
      { skipAuth: true }
    )
    expect(res.accessToken).toBe('a')
  })

  it('registerWholesale throws on error', async () => {
    mockedApi.post.mockResolvedValue({ error: 'CNPJ inválido', status: 400 })
    await expect(
      registerWholesale({
        email: 'a@b.com',
        password: 'senha12345',
        cnpj: '00',
        companyName: 'X',
        contactName: 'Y',
      })
    ).rejects.toThrow(/CNPJ|cadastrar/i)
  })

  it('loginWholesale posts credentials', async () => {
    mockedApi.post.mockResolvedValue({
      data: { account: { ...account, status: 'approved' }, accessToken: 'a', refreshToken: 'r' },
      status: 200,
    })
    const res = await loginWholesale({
      email: 'ana@example.com',
      password: 'senha12345',
      cnpj: '11222333000181',
    })
    expect(mockedApi.post).toHaveBeenCalledWith(
      '/wholesale/login',
      expect.any(Object),
      { skipAuth: true }
    )
    expect(res.account.status).toBe('approved')
  })

  it('getMyWholesaleAccount returns null when empty', async () => {
    mockedApi.get.mockResolvedValue({ data: null, status: 404 })
    expect(await getMyWholesaleAccount()).toBeNull()
  })

  it('getMyWholesaleAccount returns account', async () => {
    mockedApi.get.mockResolvedValue({ data: account, status: 200 })
    expect(await getMyWholesaleAccount()).toEqual(account)
  })

  it('adminListWholesaleAccounts builds query', async () => {
    mockedApi.get.mockResolvedValue({
      data: { accounts: [account], total: 1, page: 1, limit: 50 },
      status: 200,
    })
    const res = await adminListWholesaleAccounts({ status: 'pending', page: 1 })
    expect(mockedApi.get).toHaveBeenCalledWith(expect.stringContaining('status=pending'))
    expect(res.total).toBe(1)
  })

  it('adminListWholesaleAccounts defaults empty', async () => {
    mockedApi.get.mockResolvedValue({ data: null, status: 200 })
    const res = await adminListWholesaleAccounts()
    expect(res.accounts).toEqual([])
  })

  it('adminReviewWholesale patches action', async () => {
    mockedApi.patch.mockResolvedValue({
      data: { ...account, status: 'approved' },
      status: 200,
    })
    const res = await adminReviewWholesale('wa-1', 'approve')
    expect(mockedApi.patch).toHaveBeenCalledWith('/wholesale/accounts/wa-1', {
      action: 'approve',
    })
    expect(res.status).toBe('approved')
  })

  it('adminReviewWholesale throws on failure', async () => {
    mockedApi.patch.mockResolvedValue({ error: 'fail', status: 500 })
    await expect(adminReviewWholesale('wa-1', 'reject', { rejectionReason: 'x' })).rejects.toThrow()
  })
})
