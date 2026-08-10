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
  listProductReviews,
  getStoreCredit,
  listOrderReviews,
  submitOrderReviews,
  adminListReviews,
  adminSetReviewStatus,
} from './reviews'

const mockedApi = vi.mocked(api)

describe('reviews API client', () => {
  beforeEach(() => vi.clearAllMocks())

  it('listProductReviews', async () => {
    mockedApi.get.mockResolvedValue({ data: { reviews: [], total: 0 }, status: 200 })
    const res = await listProductReviews('slug', { page: 1, limit: 5 })
    expect(res.total).toBe(0)
    expect(mockedApi.get).toHaveBeenCalledWith(expect.stringContaining('/reviews/product/slug'), {
      skipAuth: true,
    })
  })

  it('getStoreCredit defaults', async () => {
    mockedApi.get.mockResolvedValue({ data: null, status: 200 })
    expect(await getStoreCredit()).toEqual({ balance: 0, rewardAmount: 1 })
  })

  it('listOrderReviews', async () => {
    mockedApi.get.mockResolvedValue({ data: { reviews: [{ id: 'r1' }] }, status: 200 })
    expect(await listOrderReviews('o1')).toHaveLength(1)
  })

  it('submitOrderReviews', async () => {
    mockedApi.post.mockResolvedValue({
      data: { reviews: [], creditAwarded: 1, newBalance: 1 },
      status: 200,
    })
    const res = await submitOrderReviews('o1', [{ productId: 'p1', rating: 5 }])
    expect(res.creditAwarded).toBe(1)
  })

  it('submitOrderReviews throws', async () => {
    mockedApi.post.mockResolvedValue({ error: 'fail', status: 400 })
    await expect(submitOrderReviews('o1', [])).rejects.toThrow()
  })

  it('adminListReviews and adminSetReviewStatus', async () => {
    mockedApi.get.mockResolvedValue({ data: { reviews: [], total: 0 }, status: 200 })
    mockedApi.patch.mockResolvedValue({
      data: { id: 'r1', status: 'hidden' },
      status: 200,
    })
    expect(await adminListReviews({ status: 'published' })).toMatchObject({ total: 0 })
    expect(await adminSetReviewStatus('r1', 'hidden')).toMatchObject({ status: 'hidden' })
  })
})
