import { BadgePercent } from 'lucide-react'
import { Badge } from '../ui/badge'
import { cn } from '../../lib/utils'

interface MemberDiscountBadgeProps {
  className?: string
}

/**
 * Small badge for the club member discount. Display only: the real total
 * comes from the backend.
 */
export function MemberDiscountBadge({ className }: MemberDiscountBadgeProps) {
  return (
    <Badge
      variant="success"
      className={cn('gap-1 whitespace-nowrap', className)}
      title="Desconto de membro do Clube GeekPop & Toys"
    >
      <BadgePercent className="h-3.5 w-3.5" />
      Membro -10%
    </Badge>
  )
}

export default MemberDiscountBadge
