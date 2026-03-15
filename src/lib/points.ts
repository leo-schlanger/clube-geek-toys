import { where, orderBy, limit, addDoc, collection, serverTimestamp, type DocumentData } from 'firebase/firestore'
import { db } from './firebase'
import { FirestoreManager, MapperUtils } from './db-utils'
import { COLLECTIONS } from './constants'
import { getMemberById, updateMember } from './members'
import { withRetry } from './retry'
import type { PointTransaction, PlanType, RedemptionRule } from '../types'
import { POINTS_CONFIG, POINTS_MULTIPLIER } from '../types'

const POINTS_COLLECTION = COLLECTIONS.POINTS

/**
 * Convert Firestore document to PointTransaction type
 */
function toPointTransaction(id: string, data: DocumentData): PointTransaction {
  const mapped = MapperUtils.toCamel(data)
  return {
    id,
    memberId: mapped.memberId,
    type: mapped.type,
    points: mapped.points,
    balance: mapped.balance,
    description: mapped.description,
    purchaseValue: mapped.purchaseValue,
    expiresAt: mapped.expiresAt,
    isPromotion: mapped.isPromotion,
    createdAt: mapped.createdAt,
    createdBy: mapped.createdBy,
  }
}

/**
 * Get point multiplier based on plan
 */
export function getPointMultiplier(plan: PlanType): number {
  return POINTS_MULTIPLIER[plan] || 1
}

/**
 * Get points configuration
 */
export function getPointsConfig() {
  return POINTS_CONFIG
}

/**
 * Get available redemption rules
 */
export function getRedemptionRules(): RedemptionRule[] {
  return POINTS_CONFIG.redemptionRules
}

/**
 * Calculate expiration date (6 months from now)
 */
function calculateExpirationDate(): string {
  const date = new Date()
  date.setMonth(date.getMonth() + POINTS_CONFIG.expirationMonths)
  return date.toISOString().split('T')[0]
}

/**
 * Get member's point transactions history
 */
export async function getPointsHistory(memberId: string, limitCount = 50): Promise<PointTransaction[]> {
  return FirestoreManager.findMany(
    POINTS_COLLECTION,
    [
      where('member_id', '==', memberId),
      orderBy('created_at', 'desc'),
      limit(limitCount),
    ],
    toPointTransaction
  )
}

/**
 * Get points that are expiring soon (within 30 days)
 */
export async function getExpiringPoints(memberId: string): Promise<PointTransaction[]> {
  const thirtyDaysFromNow = new Date()
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
  const dateLimit = thirtyDaysFromNow.toISOString().split('T')[0]

  // Get all earn transactions that haven't expired yet
  const transactions = await FirestoreManager.findMany(
    POINTS_COLLECTION,
    [
      where('member_id', '==', memberId),
      where('type', '==', 'earn'),
      orderBy('expires_at', 'asc'),
    ],
    toPointTransaction
  )

  // Filter to those expiring within 30 days and not yet expired
  const today = new Date().toISOString().split('T')[0]
  return transactions.filter(
    (t) => t.expiresAt && t.expiresAt <= dateLimit && t.expiresAt >= today && t.points > 0
  )
}

/**
 * Get total valid points for a member
 * Uses denormalized points field from member document for performance
 * Falls back to recalculation only if needed
 */
export async function getValidPoints(memberId: string): Promise<number> {
  // Fast path: use denormalized points from member document
  const member = await getMemberById(memberId)
  if (member) {
    return Math.max(0, member.points || 0)
  }
  return 0
}

/**
 * Recalculate points from transactions (use sparingly - for data repair only)
 */
export async function recalculatePoints(memberId: string): Promise<number> {
  const today = new Date().toISOString().split('T')[0]

  // Get all transactions with limit for safety
  const transactions = await FirestoreManager.findMany(
    POINTS_COLLECTION,
    [
      where('member_id', '==', memberId),
      orderBy('created_at', 'asc'),
      limit(500), // Safety limit
    ],
    toPointTransaction
  )

  // Calculate valid points (sum of all, excluding expired earns)
  let total = 0
  for (const t of transactions) {
    if (t.type === 'earn' && t.expiresAt && t.expiresAt < today) {
      continue
    }
    total += t.points
  }

  return Math.max(0, total)
}

/**
 * Add points to a member (with expiration)
 */
export async function addPoints(
  memberId: string,
  purchaseValue: number,
  isPromotion: boolean,
  sellerId?: string
): Promise<{ success: boolean; pointsAdded: number; message: string }> {
  // Don't add points for promotional purchases
  if (isPromotion) {
    return {
      success: true,
      pointsAdded: 0,
      message: 'Compra em promoção - pontos não acumulam',
    }
  }

  const member = await getMemberById(memberId)
  if (!member) {
    return { success: false, pointsAdded: 0, message: 'Membro não encontrado' }
  }

  // Calculate points with multiplier
  const multiplier = getPointMultiplier(member.plan as PlanType)
  const basePoints = Math.floor(purchaseValue * POINTS_CONFIG.pointsPerReal)
  const totalPoints = basePoints * multiplier

  if (totalPoints <= 0) {
    return { success: false, pointsAdded: 0, message: 'Valor inválido' }
  }

  // Get current balance
  const currentBalance = await getValidPoints(memberId)
  const newBalance = currentBalance + totalPoints

  // Create transaction record
  const now = new Date().toISOString()
  const transactionData = MapperUtils.toSnake({
    memberId,
    type: 'earn',
    points: totalPoints,
    balance: newBalance,
    description: `Compra de R$ ${purchaseValue.toFixed(2)} (${basePoints} pts x ${multiplier})`,
    purchaseValue,
    expiresAt: calculateExpirationDate(),
    isPromotion: false,
    createdAt: now,
    createdBy: sellerId || null,
  })

  // Save transaction with retry
  const id = await withRetry(
    () => FirestoreManager.save(POINTS_COLLECTION, null, transactionData),
    { maxRetries: 3 }
  )
  if (!id) {
    return { success: false, pointsAdded: 0, message: 'Erro ao registrar pontos' }
  }

  // Update member's total points with retry
  await withRetry(
    () => updateMember(memberId, { points: newBalance }),
    { maxRetries: 3 }
  )

  // Log audit (non-critical, don't block on failure)
  try {
    await addDoc(collection(db, 'audit_logs'), {
      action: 'points_added',
      member_id: memberId,
      transaction_id: id,
      points_added: totalPoints,
      purchase_value: purchaseValue,
      multiplier,
      total_points: newBalance,
      seller_id: sellerId || null,
      timestamp: serverTimestamp(),
    })
  } catch {
    // Non-critical - silently ignore audit failures
  }

  return {
    success: true,
    pointsAdded: totalPoints,
    message: `${totalPoints} pontos adicionados (${basePoints} x ${multiplier})`,
  }
}

/**
 * Add manual/bonus points to a member (admin only)
 */
export async function addBonusPoints(
  memberId: string,
  points: number,
  reason: string,
  adminId?: string
): Promise<{ success: boolean; pointsAdded: number; message: string }> {
  if (points <= 0) {
    return { success: false, pointsAdded: 0, message: 'Quantidade de pontos inválida' }
  }

  const member = await getMemberById(memberId)
  if (!member) {
    return { success: false, pointsAdded: 0, message: 'Membro não encontrado' }
  }

  // Get current balance
  const currentBalance = await getValidPoints(memberId)
  const newBalance = currentBalance + points

  // Create transaction record
  const now = new Date().toISOString()
  const transactionData = MapperUtils.toSnake({
    memberId,
    type: 'bonus',
    points: points,
    balance: newBalance,
    description: `Bônus: ${reason}`,
    expiresAt: calculateExpirationDate(),
    isPromotion: false,
    createdAt: now,
    createdBy: adminId || null,
  })

  // Save transaction with retry
  const id = await withRetry(
    () => FirestoreManager.save(POINTS_COLLECTION, null, transactionData),
    { maxRetries: 3 }
  )
  if (!id) {
    return { success: false, pointsAdded: 0, message: 'Erro ao registrar pontos bônus' }
  }

  // Update member's total points with retry
  await withRetry(
    () => updateMember(memberId, { points: newBalance }),
    { maxRetries: 3 }
  )

  // Log audit
  try {
    await addDoc(collection(db, 'audit_logs'), {
      action: 'bonus_points_added',
      member_id: memberId,
      transaction_id: id,
      points_added: points,
      reason,
      total_points: newBalance,
      admin_id: adminId || null,
      timestamp: serverTimestamp(),
    })
  } catch {
    // Non-critical
  }

  return {
    success: true,
    pointsAdded: points,
    message: `${points} pontos bônus adicionados. Novo saldo: ${newBalance} pontos`,
  }
}

/**
 * Redeem points for a discount
 */
export async function redeemPoints(
  memberId: string,
  rule: RedemptionRule,
  sellerId?: string
): Promise<{ success: boolean; message: string }> {
  const member = await getMemberById(memberId)
  if (!member) {
    return { success: false, message: 'Membro não encontrado' }
  }

  // Get current valid points
  const currentBalance = await getValidPoints(memberId)

  if (currentBalance < rule.points) {
    return {
      success: false,
      message: `Pontos insuficientes. Necessário: ${rule.points}, Disponível: ${currentBalance}`,
    }
  }

  const newBalance = currentBalance - rule.points

  // Create redemption transaction
  const now = new Date().toISOString()
  const transactionData = MapperUtils.toSnake({
    memberId,
    type: 'redeem',
    points: -rule.points, // negative for redemption
    balance: newBalance,
    description: `Resgate: ${rule.description}`,
    createdAt: now,
    createdBy: sellerId || null,
  })

  // Save transaction with retry
  const id = await withRetry(
    () => FirestoreManager.save(POINTS_COLLECTION, null, transactionData),
    { maxRetries: 3 }
  )
  if (!id) {
    return { success: false, message: 'Erro ao registrar resgate' }
  }

  // Update member's total points with retry
  await withRetry(
    () => updateMember(memberId, { points: newBalance }),
    { maxRetries: 3 }
  )

  // Log audit (non-critical, don't block on failure)
  try {
    await addDoc(collection(db, 'audit_logs'), {
      action: 'points_redeemed',
      member_id: memberId,
      transaction_id: id,
      points_redeemed: rule.points,
      discount_value: rule.value,
      total_points: newBalance,
      seller_id: sellerId || null,
      timestamp: serverTimestamp(),
    })
  } catch {
    // Non-critical - silently ignore audit failures
  }

  return {
    success: true,
    message: `Resgate realizado! ${rule.description}. Saldo: ${newBalance} pontos`,
  }
}

/**
 * Expire old points (run periodically or on demand)
 * Returns number of points expired
 * Optimized: single query, batch processing, no N+1
 */
export async function expireOldPoints(memberId: string): Promise<number> {
  const today = new Date().toISOString().split('T')[0]

  // Get expired earn transactions (with limit for safety)
  const transactions = await FirestoreManager.findMany(
    POINTS_COLLECTION,
    [
      where('member_id', '==', memberId),
      where('type', '==', 'earn'),
      orderBy('expires_at', 'asc'),
      limit(100), // Process in batches
    ],
    toPointTransaction
  )

  // Filter expired ones in memory (single pass)
  const expiredTransactions = transactions.filter(
    (t) => t.expiresAt && t.expiresAt < today && t.points > 0
  )

  if (expiredTransactions.length === 0) {
    return 0
  }

  // Calculate total to expire
  const totalExpired = expiredTransactions.reduce((sum, t) => sum + t.points, 0)

  // Get current balance ONCE (not in loop)
  const member = await getMemberById(memberId)
  if (!member) return 0

  let currentBalance = member.points || 0
  const now = new Date().toISOString()

  // Create expire transactions in sequence (Firestore doesn't support batch with auto-id)
  for (const t of expiredTransactions) {
    currentBalance -= t.points
    const expireData = MapperUtils.toSnake({
      memberId,
      type: 'expire',
      points: -t.points,
      balance: Math.max(0, currentBalance),
      description: `Pontos expirados (ref: ${t.id})`,
      createdAt: now,
    })
    await FirestoreManager.save(POINTS_COLLECTION, null, expireData)
  }

  // Update member points ONCE at the end
  await updateMember(memberId, { points: Math.max(0, currentBalance) })

  return totalExpired
}

/**
 * Format points for display
 */
export function formatPoints(points: number): string {
  return points.toLocaleString('pt-BR')
}

/**
 * Get available redemptions based on current points
 */
export function getAvailableRedemptions(currentPoints: number): RedemptionRule[] {
  return POINTS_CONFIG.redemptionRules.filter((rule) => currentPoints >= rule.points)
}
