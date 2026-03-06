import { where, orderBy, type DocumentData } from 'firebase/firestore'
import { FirestoreManager, MapperUtils } from './db-utils'
import type { Member, MemberFormData, PlanType } from '../types'

const MEMBERS_COLLECTION = 'members'

/**
 * Convert Firestore document to Member type
 */
function toMember(id: string, data: DocumentData): Member {
  const mapped = MapperUtils.toCamel(data)
  return {
    id,
    userId: mapped.userId || mapped.userId, // handle both cases if needed
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
 * Get member by CPF
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
 * Check if CPF is already registered
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
 * Get all members
 */
export async function getAllMembers(): Promise<Member[]> {
  return FirestoreManager.findMany(
    MEMBERS_COLLECTION,
    [orderBy('created_at', 'desc')],
    toMember
  )
}

/**
 * Create new member
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
 * Update member
 */
export async function updateMember(
  id: string,
  data: Partial<Member>
): Promise<boolean> {
  const firestoreData = MapperUtils.toSnake(data)
  return FirestoreManager.update(MEMBERS_COLLECTION, id, firestoreData)
}

/**
 * Add points to a member (DEPRECATED - use addPoints from points.ts instead)
 * This function is kept for backward compatibility but should not be used
 * @deprecated Use addPoints from './points' instead for proper transaction tracking
 */
export async function addMemberPoints(id: string, points: number): Promise<boolean> {
  console.warn('addMemberPoints is deprecated. Use addPoints from ./points instead.')
  const member = await getMemberById(id)
  if (!member) return false

  const newPoints = (member.points || 0) + points
  return updateMember(id, { points: newPoints })
}

/**
 * Activate member (after payment confirmation)
 */
export async function activateMember(id: string): Promise<boolean> {
  return updateMember(id, { status: 'active' })
}

/**
 * Check if member is active
 */
export function isMemberActive(member: Member): boolean {
  if (member.status !== 'active') return false

  const expiryDate = new Date(member.expiryDate)
  return expiryDate >= new Date()
}

/**
 * Get discount percentages based on plan
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
