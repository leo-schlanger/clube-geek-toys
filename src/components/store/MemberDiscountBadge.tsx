import { BadgePercent } from 'lucide-react'
import { Badge } from '../ui/badge'
import { cn } from '../../lib/utils'

interface MemberDiscountBadgeProps {
  className?: string
}

/**
 * Pequeno selo verde indicando o desconto de 15% para membros do clube.
 * O valor é apenas de exibição (preview) — o total real vem do backend.
 */
export function MemberDiscountBadge({ className }: MemberDiscountBadgeProps) {
  return (
    <Badge
      variant="success"
      className={cn('gap-1 whitespace-nowrap', className)}
      title="Desconto de membro do Clube Geek & Toys"
    >
      <BadgePercent className="h-3.5 w-3.5" />
      Membro -15%
    </Badge>
  )
}

export default MemberDiscountBadge
