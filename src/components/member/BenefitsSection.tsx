import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { PLANS, type PlanType } from '../../types'
import { CheckCircle, ArrowUp, Gift, Info } from 'lucide-react'

interface BenefitsSectionProps {
  plan: PlanType
  paymentCount?: number
  onUpgrade: () => void
}

export function BenefitsSection({ plan, paymentCount = 0, onUpgrade }: BenefitsSectionProps) {
  const planData = PLANS[plan]
  const isMaxPlan = plan === 'black'
  const serviceDiscountLocked = plan === 'black' && paymentCount < 2

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

        {serviceDiscountLocked && (
          <div className="flex items-start gap-2 p-3 bg-yellow-100 dark:bg-yellow-900/20 rounded-lg border border-yellow-500/30">
            <Info className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              O desconto de 50% em serviços será ativado automaticamente após o seu 2º pagamento.
            </p>
          </div>
        )}

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
