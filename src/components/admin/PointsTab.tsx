import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Star, Crown, Sparkles } from 'lucide-react'
import { PLANS, type Member, type PlanType } from '../../types'
import { formatCPF } from '../../lib/utils'

const planIcons: Record<PlanType, ReactNode> = {
  silver: <Star className="h-4 w-4" />,
  gold: <Crown className="h-4 w-4" />,
  black: <Sparkles className="h-4 w-4" />,
}

interface PointsTabProps {
  members: Member[]
}

export function PointsTab({ members }: PointsTabProps) {
  const pointsReport = [...members]
    .filter((m) => m.points > 0)
    .sort((a, b) => b.points - a.points)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Relatório de Pontos</CardTitle>
        <CardDescription>Ranking de membros por pontos acumulados</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left py-3 px-4 font-medium text-sm w-16">Posição</th>
                <th className="text-left py-3 px-4 font-medium text-sm">Membro</th>
                <th className="text-left py-3 px-4 font-medium text-sm">Plano</th>
                <th className="text-right py-3 px-4 font-medium text-sm">Total de Pontos</th>
              </tr>
            </thead>
            <tbody>
              {pointsReport.map((member, index) => (
                <tr key={member.id} className="border-b hover:bg-muted/50 transition-colors">
                  <td className="py-4 px-4 font-bold text-muted-foreground">
                    #{index + 1}
                  </td>
                  <td className="py-4 px-4">
                    <p className="font-medium">{member.fullName}</p>
                    <p className="text-sm text-muted-foreground">{formatCPF(member.cpf)}</p>
                  </td>
                  <td className="py-4 px-4">
                    <Badge variant={member.plan as 'silver' | 'gold' | 'black'} className="gap-1">
                      {planIcons[member.plan as PlanType]}
                      {PLANS[member.plan as PlanType].name}
                    </Badge>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <span className="font-bold text-primary text-lg">
                      {member.points}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {pointsReport.length === 0 && (
            <div className="text-center py-12">
              <Star className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground font-medium">Nenhum membro com pontos</p>
              <p className="text-xs text-muted-foreground mt-1">Os pontos distribuídos no PDV aparecerão aqui</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
