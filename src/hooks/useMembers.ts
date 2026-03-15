/**
 * useMembers - Hook for member operations
 */

import { useState, useCallback, useEffect } from 'react'
import { getAllMembers, getMemberById, updateMember as updateMemberApi } from '../lib/members'
import { membersLogger } from '../lib/logger'
import type { Member } from '../types'

interface UseMembersOptions {
  autoFetch?: boolean
}

interface UseMembersReturn {
  members: Member[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  getMember: (id: string) => Promise<Member | null>
  updateMember: (id: string, data: Partial<Member>) => Promise<boolean>
}

export function useMembers(options: UseMembersOptions = {}): UseMembersReturn {
  const { autoFetch = true } = options

  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchMembers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getAllMembers()
      setMembers(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar membros'
      setError(message)
      membersLogger.error('Error fetching members:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const getMember = useCallback(async (id: string): Promise<Member | null> => {
    try {
      return await getMemberById(id)
    } catch (err) {
      membersLogger.error('Error getting member:', err)
      return null
    }
  }, [])

  const updateMember = useCallback(async (id: string, data: Partial<Member>): Promise<boolean> => {
    try {
      const success = await updateMemberApi(id, data as Record<string, unknown>)
      if (success) {
        // Update local state
        setMembers(prev => prev.map(m => m.id === id ? { ...m, ...data } : m))
      }
      return success
    } catch (err) {
      membersLogger.error('Error updating member:', err)
      return false
    }
  }, [])

  useEffect(() => {
    if (autoFetch) {
      fetchMembers()
    }
  }, [autoFetch, fetchMembers])

  return {
    members,
    loading,
    error,
    refetch: fetchMembers,
    getMember,
    updateMember,
  }
}

/**
 * Hook for a single member
 */
export function useMember(memberId: string | null) {
  const [member, setMember] = useState<Member | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchMember = useCallback(async () => {
    if (!memberId) {
      setMember(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const data = await getMemberById(memberId)
      setMember(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar membro'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [memberId])

  useEffect(() => {
    fetchMember()
  }, [fetchMember])

  return {
    member,
    loading,
    error,
    refetch: fetchMember,
  }
}
