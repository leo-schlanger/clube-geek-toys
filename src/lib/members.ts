import { api } from './api-client'
import { CLUB_PLAN } from '../types'
import type { Member, MemberFormData, PendingPaymentInfo } from '../types'

export interface PaginatedResult<T> {
  data: T[]
  hasMore: boolean
  totalCount?: number
}

/**
 * Busca membro pelo CPF
 */
export async function getMemberByCPF(cpf: string): Promise<Member | null> {
  const cleanCpf = cpf.replace(/\D/g, '')
  const result = await api.get<Member>(`/members/by-cpf/${cleanCpf}`)
  return result.data || null
}

/**
 * Verifica se CPF já está cadastrado no sistema.
 * Uses a public endpoint that doesn't require authentication.
 */
export async function isCPFRegistered(cpf: string): Promise<boolean> {
  const cleanCpf = cpf.replace(/\D/g, '')
  const result = await api.get<{ exists: boolean }>(`/members/cpf-exists/${cleanCpf}`, { skipAuth: true })
  return result.data?.exists ?? false
}

/**
 * Get member by user ID (own profile)
 */
export async function getMemberByUserId(_userId?: string): Promise<Member | null> {
  const result = await api.get<Member>('/members/me')
  return result.data || null
}

/**
 * Get member by ID
 */
export async function getMemberById(id: string): Promise<Member | null> {
  const result = await api.get<Member>(`/members/${id}`)
  return result.data || null
}

/**
 * Get all members (admin/seller)
 */
export async function getAllMembers(): Promise<Member[]> {
  const result = await api.get<{ members: Member[]; total: number }>('/members?limit=1000')
  return result.data?.members || []
}

/**
 * Get members with pagination
 */
export async function getMembersPaginated(
  pageSize: number = 20,
  page: number = 1
): Promise<PaginatedResult<Member>> {
  const result = await api.get<{ members: Member[]; total: number; page: number }>(
    `/members?limit=${pageSize}&page=${page}`
  )
  const members = result.data?.members || []
  const total = result.data?.total || 0
  return {
    data: members,
    hasMore: page * pageSize < total,
    totalCount: total,
  }
}

/**
 * Get total count of members
 */
export async function getMembersCount(): Promise<number> {
  const result = await api.get<{ count: number }>('/members/count')
  return result.data?.count || 0
}

/**
 * Cria novo membro no sistema.
 * userId is extracted from the JWT on the backend (req.user.userId),
 * so we only send the member data in the body.
 */
export async function createMember(
  _userId: string,
  data: MemberFormData
): Promise<Member | null> {
  const result = await api.post<Member>('/members', {
    cpf: data.cpf.replace(/\D/g, ''),
    fullName: data.fullName,
    email: data.email,
    phone: data.phone,
    plan: data.plan,
    paymentType: data.paymentType,
  })
  return result.data || null
}

/**
 * Atualiza dados de um membro
 */
export async function updateMember(
  id: string,
  data: Partial<Member>
): Promise<boolean> {
  const result = await api.patch(`/members/${id}`, data)
  return !result.error
}

/**
 * Ativa membro após confirmação de pagamento
 */
export async function activateMember(id: string): Promise<boolean> {
  return updateMember(id, { status: 'active' } as Partial<Member>)
}

/**
 * Verifica se membro está ativo (status + data de expiração)
 */
export function isMemberActive(member: Member): boolean {
  if (member.status !== 'active') return false
  const expiryDate = new Date(member.expiryDate)
  return expiryDate >= new Date()
}

/**
 * Desconto do membro do clube: 15% em qualquer produto.
 */
export function getMemberDiscount(): number {
  return CLUB_PLAN.discount
}

/**
 * Salva informações do pagamento PIX pendente no registro do membro
 */
export async function savePendingPayment(
  memberId: string,
  paymentInfo: PendingPaymentInfo
): Promise<boolean> {
  return updateMember(memberId, { pendingPayment: paymentInfo } as Partial<Member>)
}

/**
 * Remove informações do pagamento pendente
 */
export async function clearPendingPayment(memberId: string): Promise<boolean> {
  return updateMember(memberId, { pendingPayment: null } as Partial<Member>)
}
