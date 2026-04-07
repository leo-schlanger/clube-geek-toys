import { api } from './api-client'
import type { PointTransaction, PlanType, RedemptionRule } from '../types'
import { POINTS_CONFIG, POINTS_MULTIPLIER } from '../types'

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
 * Get member's point transactions history
 */
export async function getPointsHistory(memberId: string, limitCount = 50): Promise<PointTransaction[]> {
  const result = await api.get<PointTransaction[]>(`/points/${memberId}/history?limit=${limitCount}`)
  return result.data || []
}

/**
 * Get points that are expiring soon
 */
export async function getExpiringPoints(memberId: string): Promise<PointTransaction[]> {
  const result = await api.get<PointTransaction[]>(`/points/${memberId}/expiring`)
  return result.data || []
}

/**
 * Get total valid points for a member
 */
export async function getValidPoints(memberId: string): Promise<number> {
  const result = await api.get<{ points: number }>(`/points/${memberId}/balance`)
  return result.data?.points || 0
}

/**
 * Recalculate points from transactions (alias for getValidPoints via API)
 */
export async function recalculatePoints(memberId: string): Promise<number> {
  return getValidPoints(memberId)
}

/**
 * Adiciona pontos ao membro baseado em compra
 */
export async function addPoints(
  memberId: string,
  purchaseValue: number,
  isPromotion: boolean,
  _sellerId?: string
): Promise<{ success: boolean; pointsAdded: number; message: string }> {
  if (isPromotion) {
    return {
      success: true,
      pointsAdded: 0,
      message: 'Compra em promoção - pontos não acumulam',
    }
  }

  const result = await api.post(`/points/${memberId}/earn`, {
    purchaseValue,
    isPromotion,
  })

  if (result.error) {
    return { success: false, pointsAdded: 0, message: result.error }
  }

  const tx = result.data
  return {
    success: true,
    pointsAdded: tx.points,
    message: `${tx.points} pontos adicionados`,
  }
}

/**
 * Add manual/bonus points to a member (admin only)
 */
export async function addBonusPoints(
  memberId: string,
  points: number,
  reason: string,
  _adminId?: string
): Promise<{ success: boolean; pointsAdded: number; message: string }> {
  if (points <= 0) {
    return { success: false, pointsAdded: 0, message: 'Quantidade de pontos inválida' }
  }

  const result = await api.post(`/points/${memberId}/bonus`, { points, reason })

  if (result.error) {
    return { success: false, pointsAdded: 0, message: result.error }
  }

  return {
    success: true,
    pointsAdded: points,
    message: `${points} pontos bônus adicionados. Novo saldo: ${result.data.balance} pontos`,
  }
}

/**
 * Resgata pontos por desconto
 */
export async function redeemPoints(
  memberId: string,
  rule: RedemptionRule,
  _sellerId?: string
): Promise<{ success: boolean; message: string }> {
  const result = await api.post(`/points/${memberId}/redeem`, {
    ruleId: rule.id || 'custom',
    points: rule.points,
    description: rule.description,
  })

  if (result.error) {
    return { success: false, message: result.error }
  }

  return {
    success: true,
    message: `Resgate realizado! ${rule.description}. Saldo: ${result.data.balance} pontos`,
  }
}

/**
 * Expire old points (now handled server-side via cron)
 */
export async function expireOldPoints(_memberId: string): Promise<number> {
  // Points expiration is now handled by server cron job
  return 0
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
