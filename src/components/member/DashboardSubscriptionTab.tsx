import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { SubscriptionManagement } from '../SubscriptionManagement'
import type { Member, Subscription } from '../../types'
import {
  getSubscriptionStatusLabel,
  formatNextPaymentDate,
} from '../../lib/subscriptions'
import {
  Repeat,
  Settings,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CreditCard,
} from 'lucide-react'

interface DashboardSubscriptionTabProps {
  member: Member
  subscription: Subscription | null
  onSubscriptionChange: () => void
}

export function DashboardSubscriptionTab({
  member,
  subscription,
  onSubscriptionChange,
}: DashboardSubscriptionTabProps) {
  const [showManagement, setShowManagement] = useState(false)

  if (!subscription) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <CreditCard className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground font-medium">Nenhuma assinatura recorrente ativa</p>
          <p className="text-sm text-muted-foreground mt-1">
            Sua assinatura atual e avulsa (pagamento unico).
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Subscription Status Card */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Repeat className="h-5 w-5 text-primary" />
              Assinatura Recorrente
            </CardTitle>
            <Badge
              variant={
                subscription.status === 'authorized'
                  ? 'success'
                  : subscription.status === 'paused'
                  ? 'warning'
                  : 'destructive'
              }
            >
              {getSubscriptionStatusLabel(subscription.status)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Proxima cobranca</p>
              <p className="font-semibold">
                {subscription.status === 'authorized'
                  ? formatNextPaymentDate(subscription)
                  : subscription.status === 'paused'
                  ? 'Pausada'
                  : 'N/A'}
              </p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Ultimo pagamento</p>
              <p className="font-semibold">
                {subscription.lastPaymentDate
                  ? new Date(subscription.lastPaymentDate).toLocaleDateString('pt-BR')
                  : 'N/A'}
              </p>
            </div>
          </div>

          {subscription.cardLastFour && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                {subscription.cardBrand} **** {subscription.cardLastFour}
              </span>
            </div>
          )}

          {subscription.failedPayments > 0 && (
            <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span className="text-sm text-yellow-600 dark:text-yellow-400">
                {subscription.failedPayments} tentativa(s) de cobranca falharam
              </span>
            </div>
          )}

          <Button
            variant="outline"
            className="w-full"
            onClick={() => setShowManagement(!showManagement)}
          >
            <Settings className="h-4 w-4 mr-2" />
            Gerenciar Assinatura
            {showManagement ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />}
          </Button>
        </CardContent>
      </Card>

      {/* Subscription Management (expandable) */}
      {showManagement && (
        <SubscriptionManagement
          memberId={member.id}
          memberPoints={member.points}
          onSubscriptionChange={onSubscriptionChange}
        />
      )}
    </div>
  )
}
