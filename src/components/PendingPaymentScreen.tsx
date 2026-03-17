import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { PaymentModal } from './PaymentModal'
import { updateMember } from '../lib/members'
import { useAuth } from '../contexts/AuthContext'
import { PLANS, type Member, type PlanType } from '../types'
import { formatCurrency } from '../lib/utils'
import { toast } from 'sonner'
import {
  Clock,
  CreditCard,
  AlertTriangle,
  LogOut,
  Star,
  Crown,
  Sparkles,
  CheckCircle,
  XCircle,
  RefreshCw,
} from 'lucide-react'

interface PendingPaymentScreenProps {
  member: Member
  onPaymentSuccess: () => void
}

export function PendingPaymentScreen({ member, onPaymentSuccess }: PendingPaymentScreenProps) {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const [showPayment, setShowPayment] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const plan = PLANS[member.plan as PlanType]
  const price = member.paymentType === 'monthly' ? plan.priceMonthly : plan.priceAnnual

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

  async function handlePaymentSuccess() {
    // Calculate new expiry date
    const now = new Date()
    const newExpiry = new Date(now)
    if (member.paymentType === 'monthly') {
      newExpiry.setMonth(newExpiry.getMonth() + 1)
    } else {
      newExpiry.setFullYear(newExpiry.getFullYear() + 1)
    }

    // Update member status to active
    const success = await updateMember(member.id, {
      status: 'active',
      startDate: now.toISOString().split('T')[0],
      expiryDate: newExpiry.toISOString().split('T')[0],
    })

    if (success) {
      toast.success('Pagamento confirmado! Bem-vindo ao Clube Geek & Toys!')
      setShowPayment(false)
      onPaymentSuccess()
    } else {
      toast.error('Erro ao ativar assinatura. Entre em contato com o suporte.')
    }
  }

  async function handleCancelMembership() {
    const confirmed = confirm(
      'Tem certeza que deseja cancelar seu cadastro?\n\n' +
      'Seu cadastro será removido e você precisará se registrar novamente para assinar.'
    )

    if (!confirmed) return

    setCancelling(true)
    try {
      // Mark member as inactive (soft delete)
      await updateMember(member.id, { status: 'inactive' })
      toast.success('Cadastro cancelado')
      await signOut()
      navigate('/')
    } catch {
      toast.error('Erro ao cancelar cadastro')
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glass border-b border-border sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.jpg" alt="Geek & Toys" className="h-10 rounded" />
            <span className="text-lg font-heading font-bold text-foreground">Clube Geek & Toys</span>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Alert Banner */}
        <div className="mb-8 p-4 rounded-lg bg-yellow-500/20 border border-yellow-500/50 flex items-start gap-4">
          <AlertTriangle className="h-6 w-6 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="font-bold text-yellow-200">Pagamento Pendente</h2>
            <p className="text-sm text-yellow-200/80 mt-1">
              Seu cadastro foi realizado, mas o pagamento ainda não foi confirmado.
              Complete o pagamento para ativar sua assinatura e aproveitar todos os benefícios.
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Plan Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-500" />
                Resumo do Pedido
              </CardTitle>
              <CardDescription>
                Confirme os detalhes da sua assinatura
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Plan Card */}
              <div className={`p-4 rounded-lg bg-gradient-to-br ${planColors[member.plan as PlanType]} text-white`}>
                <div className="flex items-center gap-3 mb-3">
                  {planIcons[member.plan as PlanType]}
                  <div>
                    <p className="font-bold text-lg">Plano {plan.name}</p>
                    <p className="text-sm opacity-80">
                      {member.paymentType === 'monthly' ? 'Mensal' : 'Anual'}
                    </p>
                  </div>
                </div>
                <div className="text-2xl font-bold">
                  {formatCurrency(price)}
                  <span className="text-sm font-normal opacity-80">
                    /{member.paymentType === 'monthly' ? 'mês' : 'ano'}
                  </span>
                </div>
              </div>

              {/* Benefits Preview */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Benefícios incluídos:</p>
                <ul className="space-y-1.5">
                  {plan.benefits.slice(0, 4).map((benefit, index) => (
                    <li key={index} className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                  {plan.benefits.length > 4 && (
                    <li className="text-sm text-muted-foreground pl-6">
                      +{plan.benefits.length - 4} benefícios adicionais
                    </li>
                  )}
                </ul>
              </div>

              {/* Member Info */}
              <div className="pt-4 border-t space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Nome:</span>
                  <span className="font-medium">{member.fullName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Email:</span>
                  <span className="font-medium">{member.email}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge variant="warning">Pendente</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Finalizar Pagamento
                </CardTitle>
                <CardDescription>
                  Escolha a forma de pagamento e ative sua assinatura
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => setShowPayment(true)}
                >
                  <CreditCard className="h-5 w-5 mr-2" />
                  Pagar Agora
                </Button>

                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <RefreshCw className="h-4 w-4" />
                  <span>Pagamento seguro via Mercado Pago</span>
                </div>

                <div className="p-3 rounded-lg bg-muted text-sm">
                  <p className="font-medium mb-1">Formas de pagamento:</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>• PIX (aprovação instantânea)</li>
                    <li>• Cartão de crédito</li>
                    <li>• Cartão de débito</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Cancel Option */}
            <Card className="border-destructive/50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium">Deseja cancelar?</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Se você não deseja mais continuar, pode cancelar seu cadastro.
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 text-destructive hover:text-destructive"
                      onClick={handleCancelMembership}
                      disabled={cancelling}
                    >
                      {cancelling ? 'Cancelando...' : 'Cancelar cadastro'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Payment Modal */}
      {showPayment && (
        <PaymentModal
          plan={member.plan as PlanType}
          paymentType={member.paymentType as 'monthly' | 'annual'}
          memberEmail={member.email}
          memberId={member.id}
          onClose={() => setShowPayment(false)}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  )
}
