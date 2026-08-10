import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { getMyWholesaleAccount } from '../../lib/wholesale'
import type { WholesaleAccount } from '../../types'

export interface WholesaleAccountState {
  account: WholesaleAccount | null
  isApproved: boolean
  isPending: boolean
  loading: boolean
}

/** Loads the wholesale account for the logged-in user (if any). */
export function useWholesaleAccount(): WholesaleAccountState {
  const { user, loading: authLoading } = useAuth()
  const [account, setAccount] = useState<WholesaleAccount | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true

    async function load() {
      if (authLoading) return
      if (!user) {
        setAccount(null)
        return
      }
      setLoading(true)
      try {
        const acc = await getMyWholesaleAccount()
        if (active) setAccount(acc)
      } catch {
        if (active) setAccount(null)
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [user, authLoading])

  return {
    account,
    isApproved: account?.status === 'approved',
    isPending: account?.status === 'pending',
    loading: authLoading || loading,
  }
}
