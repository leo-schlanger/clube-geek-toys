import { api } from './api-client'
import { CLUB_PLAN } from '../types'
import type { Member, MemberFormData, PendingPaymentInfo } from '../types'

export interface PaginatedResult<T> {
  data: T[]
  hasMore: boolean
  totalCount?: number
}


export async function getMemberByCPF(cpf: string): Promise<Member | null> {
  const cleanCpf = cpf.replace(/\D/g, '')
  const result = await api.get<Member>(`/members/by-cpf/${cleanCpf}`)
  return result.data || null
}

export interface MemberCardPublic {
  fullName: string
  status: string
  expiryDate: string
  isCurrent: boolean
  discountPercent: number
  planName: string
}

/** Public card check — no auth. Used by /verificar/:id and phone-camera QR scans. */
export async function verifyMemberCard(id: string): Promise<MemberCardPublic | null> {
  const result = await api.get<MemberCardPublic>(`/members/verify/${id}`, { skipAuth: true })
  return result.data || null
}

/**
 * Uses a public endpoint that does not require authentication.
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

/** Per-page cap accepted by GET /members. */
const MEMBER_PAGE_SIZE = 100
/** Safety stop: 100 pages is 10k members. */
const MEMBER_MAX_PAGES = 100

/**
 * Get all members (admin/seller).
 *
 * Pages in batches of 100 because the API rejects a larger `limit`: asking for
 * 1000 at once returned 400 and left the admin member list empty.
 */
export async function getAllMembers(): Promise<Member[]> {
  const all: Member[] = []
  for (let page = 1; page <= MEMBER_MAX_PAGES; page++) {
    const result = await api.get<{ members: Member[]; total: number }>(
      `/members?limit=${MEMBER_PAGE_SIZE}&page=${page}`
    )
    const members = result.data?.members
    if (!members?.length) break
    all.push(...members)
    if (all.length >= (result.data?.total ?? all.length)) break
    if (members.length < MEMBER_PAGE_SIZE) break
  }
  return all
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
 * Updates a member. **Throws** when the server refuses.
 *
 * It used to swallow the failure and return `false`. Every caller sat inside a
 * `try/catch` that could therefore never fire, so a 403 or a 500 still produced
 * "Membro ativado até dd/mm" while the record was untouched — the admin
 * confirmed a PIX, saw success, and the member stayed `pending` with no card
 * and no discount. Returns `true` so the callers that branch on it still read
 * naturally.
 */
export async function updateMember(
  id: string,
  data: Partial<Member>
): Promise<boolean> {
  const result = await api.patch(`/members/${id}`, data)
  if (result.error) throw new Error(result.error)
  return true
}

/**
 * Manual activation by an admin. The API fills the same monthly window when
 * these fields are absent.
 */
export async function activateMember(id: string): Promise<boolean> {
  const start = new Date()
  const expiry = new Date(start)
  expiry.setMonth(expiry.getMonth() + 1)
  return updateMember(id, {
    status: 'active',
    startDate: start.toISOString().slice(0, 10),
    expiryDate: expiry.toISOString().slice(0, 10),
    activatedAt: start.toISOString(),
    activatedByPayment: 'admin_manual',
    pendingPayment: null,
  } as Partial<Member>)
}

/** Active means both the status and the expiry date agree. */
export function isMemberActive(member: Member): boolean {
  if (member.status !== 'active') return false
  if (!member.expiryDate) return false
  const expiryDate = new Date(member.expiryDate)
  if (Number.isNaN(expiryDate.getTime())) return false
  return expiryDate >= new Date()
}


export function getMemberDiscount(): number {
  return CLUB_PLAN.discount
}


export async function savePendingPayment(
  memberId: string,
  paymentInfo: PendingPaymentInfo
): Promise<boolean> {
  return updateMember(memberId, { pendingPayment: paymentInfo } as Partial<Member>)
}


export async function clearPendingPayment(memberId: string): Promise<boolean> {
  return updateMember(memberId, { pendingPayment: null })
}
