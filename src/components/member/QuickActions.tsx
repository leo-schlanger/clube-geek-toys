import { Button } from '../ui/button'
import { type Member } from '../../types'
import { calculateDaysUntilExpiry } from '../../lib/utils'
import { RefreshCw, ArrowUp, Settings } from 'lucide-react'

interface QuickActionsProps {
  member: Member
  onRenew: () => void
  onUpgrade: () => void
  onEditProfile: () => void
}

export function QuickActions({ member, onRenew, onUpgrade, onEditProfile }: QuickActionsProps) {
  const daysUntilExpiry = calculateDaysUntilExpiry(new Date(member.expiryDate))
  const isMaxPlan = member.plan === 'black'
  const needsRenewal = daysUntilExpiry <= 30

  return (
    <div className="grid grid-cols-2 gap-3">
      {needsRenewal ? (
        <Button
          size="lg"
          className="w-full h-14 text-base btn-glow"
          onClick={onRenew}
        >
          <RefreshCw className="h-5 w-5 mr-2" />
          Renovar
        </Button>
      ) : (
        <Button
          variant="outline"
          size="lg"
          className="w-full h-14 text-base"
          onClick={onEditProfile}
        >
          <Settings className="h-5 w-5 mr-2" />
          Meu Perfil
        </Button>
      )}

      {!isMaxPlan ? (
        <Button
          variant="outline"
          size="lg"
          className="w-full h-14 text-base"
          onClick={onUpgrade}
        >
          <ArrowUp className="h-5 w-5 mr-2" />
          Fazer Upgrade
        </Button>
      ) : (
        <Button
          variant="outline"
          size="lg"
          className="w-full h-14 text-base"
          onClick={onRenew}
        >
          <RefreshCw className="h-5 w-5 mr-2" />
          Renovar
        </Button>
      )}
    </div>
  )
}
