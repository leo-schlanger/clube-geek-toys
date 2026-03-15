import { where, orderBy, type DocumentData, type DocumentSnapshot } from 'firebase/firestore'
import { FirestoreManager, MapperUtils } from './db-utils'
import { COLLECTIONS } from './constants'
import type { Member, MemberFormData, PlanType } from '../types'

export interface PaginatedResult<T> {
  data: T[]
  lastDoc: DocumentSnapshot | null
  hasMore: boolean
  totalCount?: number
}

const MEMBERS_COLLECTION = COLLECTIONS.MEMBERS

/**
 * Converte documento Firestore para tipo Member
 * @param id - ID do documento Firestore
 * @param data - Dados brutos do documento
 * @returns Objeto Member tipado
 * @internal
 */
function toMember(id: string, data: DocumentData): Member {
  const mapped = MapperUtils.toCamel(data)
  return {
    id,
    userId: mapped.userId || '',
    cpf: mapped.cpf,
    fullName: mapped.fullName,
    email: mapped.email,
    phone: mapped.phone,
    photoUrl: mapped.photoUrl,
    plan: mapped.plan,
    status: mapped.status,
    paymentType: mapped.paymentType,
    startDate: mapped.startDate,
    expiryDate: mapped.expiryDate,
    points: mapped.points || 0,
    createdAt: mapped.createdAt,
    updatedAt: mapped.updatedAt,
  }
}

/**
 * Busca membro pelo CPF
 * @param cpf - CPF do membro (com ou sem formatação)
 * @returns Membro encontrado ou null se não existir
 * @example
 * const member = await getMemberByCPF('123.456.789-00')
 * if (member) console.log(member.fullName)
 */
export async function getMemberByCPF(cpf: string): Promise<Member | null> {
  const results = await FirestoreManager.findMany(
    MEMBERS_COLLECTION,
    [where('cpf', '==', cpf.replace(/\D/g, ''))],
    toMember
  )
  return results.length > 0 ? results[0] : null
}

/**
 * Verifica se CPF já está cadastrado no sistema
 * @param cpf - CPF a verificar (com ou sem formatação)
 * @returns true se já existe membro com este CPF
 * @example
 * if (await isCPFRegistered('12345678900')) {
 *   toast.error('CPF já cadastrado')
 * }
 */
export async function isCPFRegistered(cpf: string): Promise<boolean> {
  const member = await getMemberByCPF(cpf)
  return member !== null
}

/**
 * Get member by user ID
 */
export async function getMemberByUserId(userId: string): Promise<Member | null> {
  const results = await FirestoreManager.findMany(
    MEMBERS_COLLECTION,
    [where('user_id', '==', userId)],
    toMember
  )
  return results.length > 0 ? results[0] : null
}

/**
 * Get member by ID
 */
export async function getMemberById(id: string): Promise<Member | null> {
  return FirestoreManager.getById(MEMBERS_COLLECTION, id, toMember)
}

/**
 * Get all members (no pagination - use for small datasets or reports)
 */
export async function getAllMembers(): Promise<Member[]> {
  return FirestoreManager.findMany(
    MEMBERS_COLLECTION,
    [orderBy('created_at', 'desc')],
    toMember
  )
}

/**
 * Get members with pagination
 */
export async function getMembersPaginated(
  pageSize: number = 20,
  lastDoc?: DocumentSnapshot
): Promise<PaginatedResult<Member>> {
  const result = await FirestoreManager.findManyPaginated(
    MEMBERS_COLLECTION,
    [orderBy('created_at', 'desc')],
    toMember,
    pageSize,
    lastDoc
  )
  return result
}

/**
 * Get total count of members
 */
export async function getMembersCount(): Promise<number> {
  return FirestoreManager.getCount(MEMBERS_COLLECTION, [])
}

/**
 * Cria novo membro no sistema
 * @param userId - UID do Firebase Auth
 * @param data - Dados do formulário de cadastro
 * @returns Membro criado ou null em caso de erro
 * @example
 * const member = await createMember(user.uid, {
 *   cpf: '12345678900',
 *   fullName: 'João Silva',
 *   email: 'joao@email.com',
 *   phone: '11999999999',
 *   plan: 'gold',
 *   paymentType: 'monthly'
 * })
 */
export async function createMember(
  userId: string,
  data: MemberFormData
): Promise<Member | null> {
  const now = new Date().toISOString()
  const startDate = now.split('T')[0]

  // Calculate expiry date
  const expiryDate = new Date()
  if (data.paymentType === 'annual') {
    expiryDate.setFullYear(expiryDate.getFullYear() + 1)
  } else {
    expiryDate.setMonth(expiryDate.getMonth() + 1)
  }

  const memberData = MapperUtils.toSnake({
    userId,
    cpf: data.cpf.replace(/\D/g, ''),
    fullName: data.fullName,
    email: data.email,
    phone: data.phone,
    photoUrl: null,
    plan: data.plan,
    status: 'pending',
    paymentType: data.paymentType,
    startDate,
    expiryDate: expiryDate.toISOString().split('T')[0],
    points: 0,
    createdAt: now,
  })

  const id = await FirestoreManager.save(MEMBERS_COLLECTION, null, memberData)
  if (!id) return null

  return toMember(id, memberData)
}

/**
 * Atualiza dados de um membro
 * @param id - ID do membro no Firestore
 * @param data - Campos a atualizar (parcial)
 * @returns true se atualizado com sucesso
 * @example
 * await updateMember(member.id, { status: 'active', points: 100 })
 */
export async function updateMember(
  id: string,
  data: Partial<Member>
): Promise<boolean> {
  const firestoreData = MapperUtils.toSnake(data)
  return FirestoreManager.update(MEMBERS_COLLECTION, id, firestoreData)
}

/**
 * Ativa membro após confirmação de pagamento
 * @param id - ID do membro
 * @returns true se ativado com sucesso
 */
export async function activateMember(id: string): Promise<boolean> {
  return updateMember(id, { status: 'active' })
}

/**
 * Verifica se membro está ativo (status + data de expiração)
 * @param member - Objeto membro
 * @returns true se status é 'active' E não expirou
 * @example
 * if (!isMemberActive(member)) {
 *   toast.warning('Assinatura expirada')
 * }
 */
export function isMemberActive(member: Member): boolean {
  if (member.status !== 'active') return false

  const expiryDate = new Date(member.expiryDate)
  return expiryDate >= new Date()
}

/**
 * Retorna percentuais de desconto baseado no plano
 * @param plan - Tipo do plano (silver, gold, black)
 * @returns Objeto com percentuais de desconto para produtos e serviços
 * @example
 * const { products, services } = getMemberDiscount('gold')
 * // products = 15, services = 35
 */
export function getMemberDiscount(plan: PlanType): { products: number; services: number } {
  switch (plan) {
    case 'silver':
      return { products: 10, services: 20 }
    case 'gold':
      return { products: 15, services: 35 }
    case 'black':
      return { products: 20, services: 50 }
    default:
      return { products: 0, services: 0 }
  }
}
