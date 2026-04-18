import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { PLANS, type PlanType } from '../../types'
import { CheckCircle, ArrowUp, Gift } from 'lucide-react'

interface BenefitsSectionProps {
  plan: PlanType
  onUpgrade: () => void
}

export function BenefitsSection({ plan, onUpgrade }: BenefitsSectionProps) {
  const planData = PLANS[plan]
  const isMaxPlan = plan === 'black'

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Gift className="h-5 w-5 text-primary" />
          Benefícios do Plano {planData.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2">
          {planData.benefits.map((benefit, index) => (
            <li
              key={index}
              className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors"
            >
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
              <span className="text-sm">{benefit}</span>
            </li>
          ))}
        </ul>

        {!isMaxPlan && (
          <Button variant="outline" className="w-full" onClick={onUpgrade}>
            <ArrowUp className="h-4 w-4 mr-2" />
            Faça upgrade para desbloquear mais benefícios
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
