import { api } from './api-client'

/**
 * Product Q&A.
 * A question appears on the storefront as soon as it is asked; moderation is
 * after the fact.
 */

export interface ProductQuestion {
  id: string
  productId: string
  userId: string
  body: string
  status: 'published' | 'hidden'
  answerBody: string | null
  answeredAt: string | null
  createdAt: string
  authorName?: string | null
  productName?: string | null
  productSlug?: string | null
}

export interface QuestionListResult {
  questions: ProductQuestion[]
  total: number
  page: number
  limit: number
}

const EMPTY: QuestionListResult = { questions: [], total: 0, page: 1, limit: 10 }

export async function listProductQuestions(
  slugOrId: string,
  params: { page?: number; limit?: number } = {}
): Promise<QuestionListResult> {
  const qs = new URLSearchParams()
  if (params.page) qs.set('page', String(params.page))
  if (params.limit) qs.set('limit', String(params.limit))
  const result = await api.get<QuestionListResult>(
    `/questions/product/${slugOrId}${qs.toString() ? `?${qs}` : ''}`,
    { skipAuth: true }
  )
  return result.data ?? EMPTY
}

export type AskQuestionResult =
  | { ok: true; question: ProductQuestion }
  | { ok: false; error: string }

export async function askQuestion(productId: string, body: string): Promise<AskQuestionResult> {
  const result = await api.post<ProductQuestion>('/questions', { productId, body })
  return result.data
    ? { ok: true, question: result.data }
    : { ok: false, error: result.error || 'Não foi possível enviar a pergunta.' }
}

export async function listMyQuestions(): Promise<ProductQuestion[]> {
  const result = await api.get<{ questions: ProductQuestion[] }>('/questions/me')
  return result.data?.questions ?? []
}

export interface AdminQuestionListResult extends QuestionListResult {
  pending: number
}

export async function adminListQuestions(
  params: { answered?: boolean; page?: number; limit?: number } = {}
): Promise<AdminQuestionListResult> {
  const qs = new URLSearchParams()
  if (params.answered !== undefined) qs.set('answered', String(params.answered))
  if (params.page) qs.set('page', String(params.page))
  if (params.limit) qs.set('limit', String(params.limit))
  const result = await api.get<AdminQuestionListResult>(
    `/questions/admin${qs.toString() ? `?${qs}` : ''}`
  )
  return result.data ?? { ...EMPTY, pending: 0 }
}

export async function answerQuestion(
  id: string,
  answer: string
): Promise<ProductQuestion | null> {
  const result = await api.post<ProductQuestion>(`/questions/${id}/answer`, { answer })
  return result.data ?? null
}

export async function setQuestionStatus(
  id: string,
  status: 'published' | 'hidden'
): Promise<ProductQuestion | null> {
  const result = await api.patch<ProductQuestion>(`/questions/${id}/status`, { status })
  return result.data ?? null
}
