import { useMemo } from 'react'
import { Card, CardContent } from '../ui/card'
import { Badge } from '../ui/badge'
import { type Member, type PointTransaction } from '../../types'
import { formatPoints, getRedemptionRules } from '../../lib/points'
import { Coins, AlertTriangle, Gift } from 'lucide-react'

interface PointsSummaryBarProps {
  member: Member
  expiringPoints: PointTransaction[]
}

export function PointsSummaryBar({ member, expiringPoints }: PointsSummaryBarProps) {
  const expiringTotal = useMemo(
    () => expiringPoints.reduce((sum, t) => sum + t.points, 0),
    [expiringPoints]
  )

  const hasRedemption = useMemo(() => {
    const rules = getRedemptionRules()
    return rules.some(r => (member.points || 0) >= r.points)
  }, [member.points])

  return (
    <Card className="border-primary/20">
      <CardContent className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Balance */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-primary/10">
              <Coins className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-primary">{formatPoints(member.points || 0)}</p>
              <p className="text-xs text-muted-foreground">pontos</p>
            </div>
          </div>

          {/* Alerts */}
          <div className="flex items-center gap-2 flex-wrap">
            {expiringTotal > 0 && (
              <Badge variant="warning" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {formatPoints(expiringTotal)} expirando
              </Badge>
            )}
            {hasRedemption && (
              <Badge variant="success" className="gap-1">
                <Gift className="h-3 w-3" />
                Resgate disponível!
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
