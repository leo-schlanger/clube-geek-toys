import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  type DocumentData,
} from 'firebase/firestore'
import { db } from './firebase'
import type { Member, MemberFormData, PlanType } from '../types'

const MEMBERS_COLLECTION = 'members'

/**
 * Convert Firestore document to Member type
 */
function toMember(id: string, data: DocumentData): Member {
  return {
    id,
    userId: data.user_id || data.userId,
    cpf: data.cpf,
    fullName: data.full_name || data.fullName,
    email: data.email,
    phone: data.phone,
    photoUrl: data.photo_url || data.photoUrl,
    plan: data.plan,
    status: data.status,
    paymentType: data.payment_type || data.paymentType,
    startDate: data.start_date || data.startDate,
    expiryDate: data.expiry_date || data.expiryDate,
    points: data.points || 0,
    createdAt: data.created_at || data.createdAt,
    updatedAt: data.updated_at || data.updatedAt,
  }
}

/**
 * Convert Member to Firestore format (snake_case for compatibility)
 */
function toFirestore(member: Partial<Member>): Record<string, unknown> {
  const data: Record<string, unknown> = {}

  if (member.userId !== undefined) data.user_id = member.userId
  if (member.cpf !== undefined) data.cpf = member.cpf
  if (member.fullName !== undefined) data.full_name = member.fullName
  if (member.email !== undefined) data.email = member.email
  if (member.phone !== undefined) data.phone = member.phone
  if (member.photoUrl !== undefined) data.photo_url = member.photoUrl
  if (member.plan !== undefined) data.plan = member.plan
  if (member.status !== undefined) data.status = member.status
  if (member.paymentType !== undefined) data.payment_type = member.paymentType
  if (member.startDate !== undefined) data.start_date = member.startDate
  if (member.expiryDate !== undefined) data.expiry_date = member.expiryDate
  if (member.points !== undefined) data.points = member.points
  if (member.createdAt !== undefined) data.created_at = member.createdAt
  if (member.updatedAt !== undefined) data.updated_at = member.updatedAt

  return data
}

/**
 * Get member by CPF
 */
export async function getMemberByCPF(cpf: string): Promise<Member | null> {
  try {
    const q = query(
      collection(db, MEMBERS_COLLECTION),
      where('cpf', '==', cpf.replace(/\D/g, ''))
    )
    const snapshot = await getDocs(q)

    if (snapshot.empty) {
      return null
    }

    const docSnap = snapshot.docs[0]
    return toMember(docSnap.id, docSnap.data())
  } catch (error) {
    console.error('Error getting member by CPF:', error)
    return null
  }
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
  try {
    const q = query(
      collection(db, MEMBERS_COLLECTION),
      where('user_id', '==', userId)
    )
    const snapshot = await getDocs(q)

    if (snapshot.empty) {
      return null
    }

    const docSnap = snapshot.docs[0]
    return toMember(docSnap.id, docSnap.data())
  } catch (error) {
    console.error('Error getting member by user ID:', error)
    return null
  }
}

/**
 * Get member by ID
 */
export async function getMemberById(id: string): Promise<Member | null> {
  try {
    const docRef = doc(db, MEMBERS_COLLECTION, id)
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) {
      return null
    }

    return toMember(docSnap.id, docSnap.data())
  } catch (error) {
    console.error('Error getting member by ID:', error)
    return null
  }
}

/**
 * Get all members
 */
export async function getAllMembers(): Promise<Member[]> {
  try {
    const q = query(
      collection(db, MEMBERS_COLLECTION),
      orderBy('created_at', 'desc')
    )
    const snapshot = await getDocs(q)

    return snapshot.docs.map((docSnap) => toMember(docSnap.id, docSnap.data()))
  } catch (error) {
    console.error('Error getting all members:', error)
    return []
  }
}

/**
 * Create new member
 */
export async function createMember(
  userId: string,
  data: MemberFormData
): Promise<Member | null> {
  try {
    const now = new Date().toISOString()
    const startDate = now.split('T')[0]

    // Calculate expiry date
    const expiryDate = new Date()
    if (data.paymentType === 'annual') {
      expiryDate.setFullYear(expiryDate.getFullYear() + 1)
    } else {
      expiryDate.setMonth(expiryDate.getMonth() + 1)
    }

    const memberData = {
      user_id: userId,
      cpf: data.cpf.replace(/\D/g, ''),
      full_name: data.fullName,
      email: data.email,
      phone: data.phone,
      photo_url: null,
      plan: data.plan,
      status: 'pending' as const,
      payment_type: data.paymentType,
      start_date: startDate,
      expiry_date: expiryDate.toISOString().split('T')[0],
      points: 0,
      created_at: now,
      updated_at: now,
    }

    const docRef = doc(collection(db, MEMBERS_COLLECTION))
    await setDoc(docRef, memberData)

    return toMember(docRef.id, memberData)
  } catch (error) {
    console.error('Error creating member:', error)
    return null
  }
}

/**
 * Update member
 */
export async function updateMember(
  id: string,
  data: Partial<Member>
): Promise<boolean> {
  try {
    const docRef = doc(db, MEMBERS_COLLECTION, id)
    const firestoreData = toFirestore(data)
    firestoreData.updated_at = new Date().toISOString()

    await updateDoc(docRef, firestoreData)
    return true
  } catch (error) {
    console.error('Error updating member:', error)
    return false
  }
}

/**
 * Add points to a member
 */
export async function addMemberPoints(id: string, points: number): Promise<boolean> {
  try {
    const member = await getMemberById(id)
    if (!member) return false

    const newPoints = (member.points || 0) + points
    return updateMember(id, { points: newPoints })
  } catch (error) {
    console.error('Error adding points:', error)
    return false
  }
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
