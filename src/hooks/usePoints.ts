/**
 * usePoints - Hook for points operations
 */

import { useState, useCallback } from 'react'
import { logger } from '../lib/logger'
import {
  addPoints as addPointsApi,
  addBonusPoints as addBonusPointsApi,
  redeemPoints as redeemPointsApi,
  getPointsHistory,
  getValidPoints,
  getAvailableRedemptions,
  formatPoints,
} from '../lib/points'
import type { PointTransaction, RedemptionRule } from '../types'

interface PointsResult {
  success: boolean
  message: string
  pointsAdded?: number
}

interface UsePointsReturn {
  loading: boolean
  error: string | null
  addPoints: (memberId: string, purchaseValue: number, isPromotion: boolean, sellerId?: string) => Promise<PointsResult>
  addBonusPoints: (memberId: string, points: number, reason: string, adminId?: string) => Promise<PointsResult>
  redeemPoints: (memberId: string, rule: RedemptionRule, sellerId?: string) => Promise<PointsResult>
  getHistory: (memberId: string, limit?: number) => Promise<PointTransaction[]>
  getBalance: (memberId: string) => Promise<number>
  getRedemptions: (currentPoints: number) => RedemptionRule[]
  format: (points: number) => string
}

export function usePoints(): UsePointsReturn {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addPoints = useCallback(async (
    memberId: string,
    purchaseValue: number,
    isPromotion: boolean,
    sellerId?: string
  ): Promise<PointsResult> => {
    setLoading(true)
    setError(null)
    try {
      const result = await addPointsApi(memberId, purchaseValue, isPromotion, sellerId)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao adicionar pontos'
      setError(message)
      return { success: false, message, pointsAdded: 0 }
    } finally {
      setLoading(false)
    }
  }, [])

  const addBonusPoints = useCallback(async (
    memberId: string,
    points: number,
    reason: string,
    adminId?: string
  ): Promise<PointsResult> => {
    setLoading(true)
    setError(null)
    try {
      const result = await addBonusPointsApi(memberId, points, reason, adminId)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao adicionar pontos bônus'
      setError(message)
      return { success: false, message, pointsAdded: 0 }
    } finally {
      setLoading(false)
    }
  }, [])

  const redeemPoints = useCallback(async (
    memberId: string,
    rule: RedemptionRule,
    sellerId?: string
  ): Promise<PointsResult> => {
    setLoading(true)
    setError(null)
    try {
      const result = await redeemPointsApi(memberId, rule, sellerId)
      return { ...result, pointsAdded: 0 }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao resgatar pontos'
      setError(message)
      return { success: false, message }
    } finally {
      setLoading(false)
    }
  }, [])

  const getHistory = useCallback(async (memberId: string, limit = 50): Promise<PointTransaction[]> => {
    try {
      return await getPointsHistory(memberId, limit)
    } catch (err) {
      logger.error('[usePoints] Error getting history:', err)
      return []
    }
  }, [])

  const getBalance = useCallback(async (memberId: string): Promise<number> => {
    try {
      return await getValidPoints(memberId)
    } catch (err) {
      logger.error('[usePoints] Error getting balance:', err)
      return 0
    }
  }, [])

  const getRedemptions = useCallback((currentPoints: number): RedemptionRule[] => {
    return getAvailableRedemptions(currentPoints)
  }, [])

  const format = useCallback((points: number): string => {
    return formatPoints(points)
  }, [])

  return {
    loading,
    error,
    addPoints,
    addBonusPoints,
    redeemPoints,
    getHistory,
    getBalance,
    getRedemptions,
    format,
  }
}

/**
 * Hook for member's points with real-time balance
 */
export function useMemberPoints(memberId: string | null) {
  const [balance, setBalance] = useState(0)
  const [history, setHistory] = useState<PointTransaction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!memberId) return

    setLoading(true)
    setError(null)
    try {
      const [pts, hist] = await Promise.all([
        getValidPoints(memberId),
        getPointsHistory(memberId, 20),
      ])
      setBalance(pts)
      setHistory(hist)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar pontos'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [memberId])

  return {
    balance,
    history,
    loading,
    error,
    refresh,
    availableRedemptions: getAvailableRedemptions(balance),
  }
}
