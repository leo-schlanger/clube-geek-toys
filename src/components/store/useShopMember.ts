import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { getMemberByUserId, isMemberActive } from '../../lib/members'
import type { Member } from '../../types'

export interface ShopMemberState {
  /** Registro do membro (se o usuário logado for membro). */
  member: Member | null
  /** True quando há membro com assinatura ativa. */
  isMember: boolean
  loading: boolean
}

/**
 * Detecta se o usuário autenticado é um membro ativo do clube.
 * Usado na loja para exibir o preview de desconto de 15%.
 * O desconto real é sempre aplicado no backend em createOrder.
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
