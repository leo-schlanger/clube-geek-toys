import { Button } from '../ui/button'
import { type Member } from '../../types'
import { calculateDaysUntilExpiry } from '../../lib/utils'
import { getShopUrl } from '../../lib/subdomain'
import { RefreshCw, Settings, ShoppingBag } from 'lucide-react'

interface QuickActionsProps {
  member: Member
  onRenew: () => void
  onEditProfile: () => void
}

export function QuickActions({ member, onRenew, onEditProfile }: QuickActionsProps) {
  const daysUntilExpiry = calculateDaysUntilExpiry(new Date(member.expiryDate))
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

      <Button
        variant="outline"
        size="lg"
        className="w-full h-14 text-base"
        asChild
      >
        <a href={getShopUrl()}>
          <ShoppingBag className="h-5 w-5 mr-2" />
          Ir para a loja
        </a>
      </Button>
    </div>
  )
}
