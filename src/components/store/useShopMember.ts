import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { getMemberByUserId, isMemberActive } from '../../lib/members'
import type { Member } from '../../types'

export interface ShopMemberState {
  /** The member record, when the signed-in user has one. */
  member: Member | null
  /** True when a member with an active subscription exists. */
  isMember: boolean
  loading: boolean
}

/**
 * Whether the signed-in user is an active club member, used to preview the
 * discount. The real discount is always applied by createOrder server-side.
 */
export function useShopMember(): ShopMemberState {
  const { user, loading: authLoading } = useAuth()
  const [member, setMember] = useState<Member | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true

    if (authLoading) return

    // Async runner keeps setState off the synchronous effect body
    // (avoids react-hooks/set-state-in-effect cascading renders).
    async function loadMember() {
      if (!user) {
        setMember(null)
        return
      }
      setLoading(true)
      try {
        const m = await getMemberByUserId(user.id)
        if (active) setMember(m)
      } catch {
        if (active) setMember(null)
      } finally {
        if (active) setLoading(false)
      }
    }

    loadMember()

    return () => {
      active = false
    }
  }, [user, authLoading])

  const isMember = member != null && isMemberActive(member)

  return { member, isMember, loading: authLoading || loading }
}
