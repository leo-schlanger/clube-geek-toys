import { api } from './api-client'
import type { WholesaleAccount, WholesaleStatus } from '../types'

export interface WholesaleAuthResult {
  account: WholesaleAccount
  accessToken: string
  refreshToken: string
}

export interface WholesaleRegisterPayload {
  email: string
  password: string
  cnpj: string
  companyName: string
  tradeName?: string
  stateRegistration?: string
  phone?: string
  contactName: string
  businessActivity?: string
}

export async function registerWholesale(data: WholesaleRegisterPayload): Promise<WholesaleAuthResult> {
  const result = await api.post<WholesaleAuthResult>(
    '/wholesale/register',
    data as unknown as Record<string, unknown>,
    { skipAuth: true }
  )
  if (result.error || !result.data) {
    throw new Error(result.error || 'Não foi possível cadastrar no atacado.')
  }
  return result.data
}

export async function loginWholesale(data: {
  email: string
  password: string
  cnpj: string
}): Promise<WholesaleAuthResult> {
  const result = await api.post<WholesaleAuthResult>(
    '/wholesale/login',
    data as unknown as Record<string, unknown>,
    { skipAuth: true }
  )
  if (result.error || !result.data) {
    throw new Error(result.error || 'Não foi possível entrar no atacado.')
  }
  return result.data
}

/**
 * Is the wholesale channel accepting orders? Registration stays open either way — while this is
 * false, /atacado is a waiting list: the shop registers the CNPJ and we get in touch when we open.
 * Public endpoint; falls back to closed so a failed request never shows a buy button we can't honour.
 */
export async function getWholesaleSalesOpen(): Promise<boolean> {
  const result = await api.get<{ salesOpen: boolean }>('/wholesale/status', { skipAuth: true })
  return result.data?.salesOpen === true
}

export async function getMyWholesaleAccount(): Promise<WholesaleAccount | null> {
  const result = await api.get<WholesaleAccount>('/wholesale/me')
  return result.data ?? null
}

export async function adminListWholesaleAccounts(params: {
  status?: WholesaleStatus
  page?: number
  limit?: number
} = {}): Promise<{ accounts: WholesaleAccount[]; total: number; page: number; limit: number }> {
  const qs = new URLSearchParams()
  if (params.status) qs.set('status', params.status)
  if (params.page) qs.set('page', String(params.page))
  if (params.limit) qs.set('limit', String(params.limit))
  const query = qs.toString()
  const result = await api.get<{ accounts: WholesaleAccount[]; total: number; page: number; limit: number }>(
    `/wholesale/accounts${query ? `?${query}` : ''}`
  )
  return result.data ?? { accounts: [], total: 0, page: 1, limit: 50 }
}

export async function adminReviewWholesale(
  id: string,
  action: 'approve' | 'reject' | 'disable',
  opts?: { rejectionReason?: string; adminNotes?: string }
): Promise<WholesaleAccount> {
  const result = await api.patch<WholesaleAccount>(`/wholesale/accounts/${id}`, {
    action,
    ...opts,
  })
  if (result.error || !result.data) {
    throw new Error(result.error || 'Falha ao atualizar conta atacadista.')
  }
  return result.data
}
