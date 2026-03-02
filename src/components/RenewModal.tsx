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
  ArrowRight,
  RefreshCw,
} from 'lucide-react'

interface RenewModalProps {
  member: Member
  onClose: () => void
  onSuccess: () => void
}

export function RenewModal({ member, onClose, onSuccess }: RenewModalProps) {
  const [paymentType, setPaymentType] = useState<PaymentType>(member.paymentType)
  const [showPayment, setShowPayment] = useState(false)

  const plan = PLANS[member.plan as PlanType]
  const price = paymentType === 'monthly' ? plan.priceMonthly : plan.priceAnnual

  const planIcons = {
    silver: <Star className="h-5 w-5" />,
    gold: <Crown className="h-5 w-5" />,
    black: <Sparkles className="h-5 w-5" />,
  }

  async function handlePaymentSuccess() {
    setShowPayment(false)

    // Calculate new expiry date
    const newExpiry = new Date()
    if (paymentType === 'annual') {
      newExpiry.setFullYear(newExpiry.getFullYear() + 1)
    } else {
      newExpiry.setMonth(newExpiry.getMonth() + 1)
    }

    // Update member
    const success = await updateMember(member.id, {
      status: 'active',
      paymentType: paymentType,
      expiryDate: newExpiry.toISOString().split('T')[0],
    })

    if (success) {
      toast.success('Assinatura renovada com sucesso!')
      onSuccess()
    } else {
      toast.error('Erro ao atualizar assinatura')
    }
  }

  if (showPayment) {
    return (
      <PaymentModal
        plan={member.plan as PlanType}
        paymentType={paymentType}
        onClose={() => setShowPayment(false)}
        onSuccess={handlePaymentSuccess}
      />
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="relative">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3 mb-2">
            <RefreshCw className="h-6 w-6 text-primary" />
            <CardTitle>Renovar Assinatura</CardTitle>
          </div>
          <CardDescription>
            Renove seu plano {plan.name} e continue aproveitando os benefícios
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Current plan */}
          <div className="p-4 bg-muted rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {planIcons[member.plan as PlanType]}
                <span className="font-semibold">Plano {plan.name}</span>
              </div>
              <Badge variant={member.plan as 'silver' | 'gold' | 'black'}>
                Atual
              </Badge>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {plan.discountProducts}% em produtos · {plan.discountServices}% em serviços
            </div>
          </div>

          {/* Payment type selection */}
          <div className="space-y-3">
            <p className="font-medium">Escolha o período:</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setPaymentType('monthly')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  paymentType === 'monthly'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <p className="font-semibold">Mensal</p>
                <p className="text-xl font-bold text-primary">
                  {formatCurrency(plan.priceMonthly)}
                </p>
                <p className="text-xs text-muted-foreground">por mês</p>
                {paymentType === 'monthly' && (
                  <Check className="h-4 w-4 text-primary mx-auto mt-2" />
                )}
              </button>
              <button
                onClick={() => setPaymentType('annual')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  paymentType === 'annual'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <p className="font-semibold">Anual</p>
                <p className="text-xl font-bold text-primary">
                  {formatCurrency(plan.priceAnnual)}
                </p>
                <p className="text-xs text-muted-foreground">por ano</p>
                <Badge variant="success" className="mt-1">
                  Economize {formatCurrency(plan.priceMonthly * 12 - plan.priceAnnual)}
                </Badge>
                {paymentType === 'annual' && (
                  <Check className="h-4 w-4 text-primary mx-auto mt-2" />
                )}
              </button>
            </div>
          </div>

          {/* Summary */}
          <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm">Total a pagar:</span>
              <span className="text-2xl font-bold">{formatCurrency(price)}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Sua assinatura será renovada por {paymentType === 'monthly' ? '1 mês' : '1 ano'}
            </p>
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={() => setShowPayment(true)} className="flex-1">
              Continuar
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
