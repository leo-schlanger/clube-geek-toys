import { useState } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { PaymentModal } from './PaymentModal'
import { PLANS, type Member, type PlanType, type PaymentType } from '../types'
import { formatCurrency } from '../lib/utils'
import { updateMember } from '../lib/members'
import { toast } from 'sonner'
import {
  X,
  Star,
  Crown,
  Sparkles,
  Check,
  ArrowUp,
  ArrowRight,
  Zap,
} from 'lucide-react'

interface UpgradeModalProps {
  member: Member
  onClose: () => void
  onSuccess: () => void
}

export function UpgradeModal({ member, onClose, onSuccess }: UpgradeModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<PlanType | null>(null)
  const [paymentType, setPaymentType] = useState<PaymentType>(member.paymentType)
  const [showPayment, setShowPayment] = useState(false)

  const currentPlan = PLANS[member.plan as PlanType]

  const planIcons = {
    silver: <Star className="h-6 w-6" />,
    gold: <Crown className="h-6 w-6" />,
    black: <Sparkles className="h-6 w-6" />,
  }

  const planColors = {
    silver: 'from-slate-400 to-slate-600',
    gold: 'from-yellow-400 to-amber-600',
    black: 'from-gray-700 to-gray-900',
  }

  // Available plans for upgrade (higher than current)
  const planOrder: PlanType[] = ['silver', 'gold', 'black']
  const currentPlanIndex = planOrder.indexOf(member.plan as PlanType)
  const availablePlans = planOrder.slice(currentPlanIndex + 1)

  async function handlePaymentSuccess() {
    if (!selectedPlan) return

    setShowPayment(false)

    // Calculate new expiry date
    const newExpiry = new Date()
    if (paymentType === 'annual') {
      newExpiry.setFullYear(newExpiry.getFullYear() + 1)
    } else {
      newExpiry.setMonth(newExpiry.getMonth() + 1)
    }

    // Update member with new plan
    const success = await updateMember(member.id, {
      plan: selectedPlan,
      status: 'active',
      paymentType: paymentType,
      expiryDate: newExpiry.toISOString().split('T')[0],
    })

    if (success) {
      toast.success(`Upgrade para ${PLANS[selectedPlan].name} realizado com sucesso!`)
      onSuccess()
    } else {
      toast.error('Erro ao fazer upgrade')
    }
  }

  if (showPayment && selectedPlan) {
    return (
      <PaymentModal
        plan={selectedPlan}
        paymentType={paymentType}
        onClose={() => setShowPayment(false)}
        onSuccess={handlePaymentSuccess}
      />
    )
  }

  // If already Black, no upgrade available
  if (availablePlans.length === 0) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
          <CardHeader className="relative text-center">
            <button
              onClick={onClose}
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="mx-auto mb-4 p-4 bg-gradient-to-br from-gray-700 to-gray-900 rounded-full w-fit">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <CardTitle>Você já tem o melhor plano!</CardTitle>
            <CardDescription>
              O plano Black é o mais completo. Você já aproveita todos os benefícios máximos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="p-4 bg-muted rounded-lg space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>{currentPlan.discountProducts}% em produtos</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>{currentPlan.discountServices}% em serviços</span>
              </div>
              {currentPlan.benefits.map((benefit, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  <span>{benefit}</span>
                </div>
              ))}
            </div>
            <Button onClick={onClose} className="w-full mt-4">
              Fechar
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="relative">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3 mb-2">
            <ArrowUp className="h-6 w-6 text-primary" />
            <CardTitle>Fazer Upgrade</CardTitle>
          </div>
          <CardDescription>
            Melhore seu plano e aproveite ainda mais benefícios
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Current plan */}
          <div className="p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-gradient-to-br ${planColors[member.plan as PlanType]} text-white`}>
                {planIcons[member.plan as PlanType]}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Seu plano atual</p>
                <p className="font-semibold">{currentPlan.name}</p>
              </div>
              <Badge variant="outline" className="ml-auto">
                {currentPlan.discountProducts}% produtos
              </Badge>
            </div>
          </div>

          {/* Available plans */}
          <div className="space-y-3">
            <p className="font-medium">Escolha o novo plano:</p>
            <div className="grid gap-4">
              {availablePlans.map((planId) => {
                const plan = PLANS[planId]
                const isSelected = selectedPlan === planId
                const priceDiff = (paymentType === 'monthly'
                  ? plan.priceMonthly - currentPlan.priceMonthly
                  : plan.priceAnnual - currentPlan.priceAnnual)

                return (
                  <button
                    key={planId}
                    onClick={() => setSelectedPlan(planId)}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`p-3 rounded-lg bg-gradient-to-br ${planColors[planId]} text-white`}>
                        {planIcons[planId]}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h3 className="font-bold text-lg">{plan.name}</h3>
                          {isSelected && (
                            <Check className="h-5 w-5 text-primary" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xl font-bold">
                            {formatCurrency(paymentType === 'monthly' ? plan.priceMonthly : plan.priceAnnual)}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            /{paymentType === 'monthly' ? 'mês' : 'ano'}
                          </span>
                          <Badge variant="success" className="ml-2">
                            +{formatCurrency(priceDiff)}
                          </Badge>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                          <div className="flex items-center gap-1">
                            <Zap className="h-4 w-4 text-green-500" />
                            <span>{plan.discountProducts}% em produtos</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Zap className="h-4 w-4 text-green-500" />
                            <span>{plan.discountServices}% em serviços</span>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {plan.benefits.slice(2, 5).map((benefit, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {benefit}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Payment type selection */}
          {selectedPlan && (
            <div className="space-y-3">
              <p className="font-medium">Período de cobrança:</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setPaymentType('monthly')}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    paymentType === 'monthly'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <p className="font-semibold">Mensal</p>
                  <p className="text-lg font-bold text-primary">
                    {formatCurrency(PLANS[selectedPlan].priceMonthly)}
                  </p>
                </button>
                <button
                  onClick={() => setPaymentType('annual')}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    paymentType === 'annual'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <p className="font-semibold">Anual</p>
                  <p className="text-lg font-bold text-primary">
                    {formatCurrency(PLANS[selectedPlan].priceAnnual)}
                  </p>
                  <Badge variant="success" className="mt-1">Economize!</Badge>
                </button>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button
              onClick={() => setShowPayment(true)}
              className="flex-1"
              disabled={!selectedPlan}
            >
              Fazer Upgrade
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
