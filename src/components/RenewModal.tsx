import { useState } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { PaymentModal } from './PaymentModal'
import { CLUB_PLAN, type Member } from '../types'
import { formatCurrency } from '../lib/utils'
import { toast } from 'sonner'
import {
  X,
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
  const [showPayment, setShowPayment] = useState(false)

  function handlePaymentSuccess() {
    setShowPayment(false)
    // Status and expiryDate are set by the backend via webhook (card) or admin confirm (PIX),
    // which correctly extends from the current expiry — we must not override them here.
    toast.success('Pagamento processado! Sua assinatura será atualizada em instantes.')
    onSuccess()
  }

  if (showPayment) {
    return (
      <PaymentModal
        plan="club"
        paymentType="annual"
        memberId={member.id}
        memberEmail={member.email}
        memberName={member.fullName}
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
            Renove seu {CLUB_PLAN.name} por mais 1 ano e continue aproveitando os benefícios
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Plan card */}
          <div className="p-4 bg-muted rounded-lg space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="font-semibold">{CLUB_PLAN.name}</span>
            </div>
            <ul className="space-y-1.5">
              {CLUB_PLAN.benefits.map((benefit, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  {benefit}
                </li>
              ))}
            </ul>
          </div>

          {/* Summary */}
          <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm">Total a pagar:</span>
              <span className="text-2xl font-bold">{formatCurrency(CLUB_PLAN.price)}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Sua assinatura será renovada por 1 ano
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
