import { api } from './api-client'

export interface ProductReview {
  id: string
  productId: string
  orderId: string
  orderItemId: string | null
  userId: string
  memberId: string | null
  rating: number
  title: string | null
  body: string | null
  status: 'pending' | 'published' | 'hidden'
  createdAt: string
  updatedAt: string
  authorName?: string | null
  productName?: string
  productSlug?: string
}

export async function listProductReviews(
  slugOrId: string,
  params: { page?: number; limit?: number } = {}
): Promise<{ reviews: ProductReview[]; total: number }> {
  const qs = new URLSearchParams()
  if (params.page) qs.set('page', String(params.page))
  if (params.limit) qs.set('limit', String(params.limit))
  const q = qs.toString()
  const result = await api.get<{ reviews: ProductReview[]; total: number }>(
    `/reviews/product/${encodeURIComponent(slugOrId)}${q ? `?${q}` : ''}`,
    { skipAuth: true }
  )
  return result.data ?? { reviews: [], total: 0 }
}

export async function getStoreCredit(): Promise<{ balance: number; rewardAmount: number }> {
  const result = await api.get<{ balance: number; rewardAmount: number }>('/reviews/me/credit')
  return result.data ?? { balance: 0, rewardAmount: 1 }
}

export async function listOrderReviews(orderId: string): Promise<ProductReview[]> {
  const result = await api.get<{ reviews: ProductReview[] }>(`/reviews/me/order/${orderId}`)
  return result.data?.reviews ?? []
}

export async function submitOrderReviews(
  orderId: string,
  reviews: { productId: string; rating: number; title?: string; body?: string }[]
): Promise<{ reviews: ProductReview[]; creditAwarded: number; newBalance: number }> {
  const result = await api.post<{
    reviews: ProductReview[]
    creditAwarded: number
    newBalance: number
  }>(`/reviews/me/order/${orderId}`, { reviews })
  if (result.error || !result.data) {
    throw new Error(result.error || 'Não foi possível enviar a avaliação.')
  }
  return result.data
}

export async function adminListReviews(params: {
  status?: string
  page?: number
} = {}): Promise<{ reviews: ProductReview[]; total: number }> {
  const qs = new URLSearchParams()
  if (params.status) qs.set('status', params.status)
  if (params.page) qs.set('page', String(params.page))
  const q = qs.toString()
  const result = await api.get<{ reviews: ProductReview[]; total: number }>(
    `/reviews${q ? `?${q}` : ''}`
  )
  return result.data ?? { reviews: [], total: 0 }
}

export async function adminSetReviewStatus(
  id: string,
  status: 'published' | 'hidden' | 'pending'
): Promise<ProductReview | null> {
  const result = await api.patch<ProductReview>(`/reviews/${id}/status`, { status })
  return result.data ?? null
}
