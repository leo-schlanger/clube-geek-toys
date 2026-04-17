import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card'
import { Button } from '../ui/button'
import { MemberActivityHistory } from '../MemberActivityHistory'
import { PLANS, POINTS_MULTIPLIER, type Member, type PlanType } from '../../types'
import { formatCurrency, calculateDaysUntilExpiry } from '../../lib/utils'
import { formatPoints } from '../../lib/points'
import {
  Coins,
  CreditCard,
  Calendar,
  Gift,
  CheckCircle,
  RefreshCw,
  ArrowUp,
} from 'lucide-react'

interface DashboardOverviewTabProps {
  member: Member
  onRenew: () => void
  onUpgrade: () => void
}

export function DashboardOverviewTab({ member, onRenew, onUpgrade }: DashboardOverviewTabProps) {
  const plan = PLANS[member.plan as PlanType]
  const multiplier = POINTS_MULTIPLIER[member.plan as PlanType]
  const daysUntilExpiry = calculateDaysUntilExpiry(new Date(member.expiryDate))

  return (
    <div className="space-y-6">
      {/* 2x2 Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-full bg-primary/10">
              <Coins className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xl font-bold">{formatPoints(member.points || 0)}</p>
              <p className="text-xs text-muted-foreground">Pontos ({multiplier}x)</p>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-full bg-yellow-500/10">
              <Calendar className="h-5 w-5 text-yellow-500" />
            </div>
            <div>
              <p className={`text-xl font-bold ${daysUntilExpiry <= 0 ? 'text-red-500' : daysUntilExpiry <= 7 ? 'text-yellow-500' : ''}`}>
                {daysUntilExpiry > 0 ? daysUntilExpiry : 0}
              </p>
              <p className="text-xs text-muted-foreground">dias restantes</p>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-full bg-green-500/10">
              <CreditCard className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-xl font-bold">
                {formatCurrency(
                  member.paymentType === 'monthly' ? plan.priceMonthly : plan.priceAnnual
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {member.paymentType === 'monthly' ? '/mes' : '/ano'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-full bg-blue-500/10">
              <Calendar className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-xl font-bold">
                {new Date(member.startDate).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}
              </p>
              <p className="text-xs text-muted-foreground">membro desde</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Benefits summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Gift className="h-5 w-5" />
            Seus Beneficios
          </CardTitle>
          <CardDescription>
            Plano {plan.name} - Aproveite todas as vantagens
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid sm:grid-cols-2 gap-2">
            {plan.benefits.map((benefit, index) => (
              <li key={index} className="flex items-start gap-2 p-2.5 bg-muted rounded-lg">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span className="text-sm">{benefit}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Recent activity (last 5) */}
      <MemberActivityHistory memberId={member.id} limit={5} />

      {/* Quick actions */}
      <div className="grid sm:grid-cols-2 gap-3">
        <Button variant="outline" size="lg" className="w-full" onClick={onRenew}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Renovar Assinatura
        </Button>
        <Button variant="outline" size="lg" className="w-full" onClick={onUpgrade}>
          <ArrowUp className="h-4 w-4 mr-2" />
          Fazer Upgrade
        </Button>
      </div>
    </div>
  )
}
