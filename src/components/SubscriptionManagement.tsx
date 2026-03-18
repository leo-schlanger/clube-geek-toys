import { useState, useEffect } from 'react'
import { paymentLogger } from '../lib/logger'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Loading } from './ui/loading'
import { CardTokenizationForm, type CardInfo } from './CardTokenizationForm'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog'
import { PLANS, type Subscription, type SubscriptionPayment, type PlanType } from '../types'
import { formatCurrency } from '../lib/utils'
import {
  getSubscriptionByMemberId,
  getSubscriptionPayments,
  pauseSubscription,
  resumeSubscription,
  cancelSubscription,
  updateSubscriptionCard,
  getSubscriptionStatusLabel,
  getSubscriptionStatusBadge,
  getFrequencyLabel,
  formatCardDisplay,
  formatNextPaymentDate,
  canPauseSubscription,
  canResumeSubscription,
  canCancelSubscription,
  canUpdateCard,
} from '../lib/subscriptions'
import { toast } from 'sonner'
import {
  CreditCard,
  Calendar,
  Clock,
  Pause,
  Play,
  XCircle,
  History,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Repeat,
  Shield,
  Sparkles,
  RefreshCw,
} from 'lucide-react'

interface SubscriptionManagementProps {
  memberId: string
  onSubscriptionChange?: () => void
}

type ConfirmAction = 'pause' | 'resume' | 'cancel' | null

export function SubscriptionManagement({
  memberId,
  onSubscriptionChange,
}: SubscriptionManagementProps) {
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [payments, setPayments] = useState<SubscriptionPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showUpdateCard, setShowUpdateCard] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)

  useEffect(() => {
    fetchSubscriptionData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId])

  async function fetchSubscriptionData() {
    setLoading(true)
    try {
      const sub = await getSubscriptionByMemberId(memberId)
      setSubscription(sub)

      if (sub) {
        const paymentHistory = await getSubscriptionPayments(sub.id)
        setPayments(paymentHistory)
      }
    } catch (error) {
      paymentLogger.error('Error fetching subscription:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handlePause() {
    if (!subscription) return
    setActionLoading(true)

    const success = await pauseSubscription(subscription.id)
    if (success) {
      toast.success('Assinatura pausada com sucesso')
      fetchSubscriptionData()
      onSubscriptionChange?.()
    } else {
      toast.error('Erro ao pausar assinatura')
    }

    setActionLoading(false)
    setConfirmAction(null)
  }

  async function handleResume() {
    if (!subscription) return
    setActionLoading(true)

    const success = await resumeSubscription(subscription.id)
    if (success) {
      toast.success('Assinatura reativada com sucesso')
      fetchSubscriptionData()
      onSubscriptionChange?.()
    } else {
      toast.error('Erro ao reativar assinatura')
    }

    setActionLoading(false)
    setConfirmAction(null)
  }

  async function handleCancel() {
    if (!subscription) return
    setActionLoading(true)

    const success = await cancelSubscription(subscription.id)
    if (success) {
      toast.success('Assinatura cancelada')
      fetchSubscriptionData()
      onSubscriptionChange?.()
    } else {
      toast.error('Erro ao cancelar assinatura')
    }

    setActionLoading(false)
    setConfirmAction(null)
  }

  async function handleUpdateCard(token: string, cardInfo: CardInfo) {
    if (!subscription) return
    setActionLoading(true)

    const success = await updateSubscriptionCard(subscription.id, token)
    if (success) {
      toast.success(`Cartão ${cardInfo.brand} **** ${cardInfo.lastFourDigits} atualizado com sucesso`)
      fetchSubscriptionData()
    } else {
      toast.error('Erro ao atualizar cartão')
    }

    setActionLoading(false)
    setShowUpdateCard(false)
  }

  function getPaymentStatusIcon(status: string) {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'rejected':
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />
    }
  }

  function getPaymentStatusLabel(status: string) {
    switch (status) {
      case 'approved':
        return 'Aprovado'
      case 'rejected':
        return 'Rejeitado'
      default:
        return 'Pendente'
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <Loading size="lg" text="Carregando assinatura..." />
        </CardContent>
      </Card>
    )
  }

  if (!subscription) {
    return (
      <Card className="border-dashed">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-4">
            <Repeat className="h-8 w-8 text-primary/60" />
          </div>
          <CardTitle className="text-xl">Assinatura Recorrente</CardTitle>
          <CardDescription className="text-base">
            Você ainda não possui uma assinatura ativa
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-green-500" />
                <span>Cobrança automática</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-blue-500" />
                <span>Benefícios garantidos</span>
              </div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-yellow-500" />
                <span>Cancele quando quiser</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Assine para ter cobrança automática e nunca perder acesso aos seus benefícios exclusivos do clube.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const planData = PLANS[subscription.plan as PlanType]
  const statusBadgeVariant = getSubscriptionStatusBadge(subscription.status)

  // Get plan-specific gradient colors
  const getPlanGradient = () => {
    switch (subscription.plan) {
      case 'black':
        return 'from-zinc-800 to-zinc-900'
      case 'gold':
        return 'from-yellow-600 to-amber-700'
      case 'silver':
      default:
        return 'from-slate-400 to-slate-500'
    }
  }

  return (
    <>
      <Card className="overflow-hidden">
        {/* Plan Header Banner */}
        <div className={`bg-gradient-to-r ${getPlanGradient()} p-4 text-white`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <span className="text-xl">{planData?.icon || '✨'}</span>
              </div>
              <div>
                <h3 className="font-bold text-lg">
                  Plano {planData?.name || subscription.plan}
                </h3>
                <p className="text-white/80 text-sm">
                  {formatCurrency(subscription.transactionAmount)}/{getFrequencyLabel(subscription.frequencyType).toLowerCase()}
                </p>
              </div>
            </div>
            <Badge
              variant={statusBadgeVariant}
              className="bg-white/20 border-white/30 text-white hover:bg-white/30"
            >
              {getSubscriptionStatusLabel(subscription.status)}
            </Badge>
          </div>
        </div>

        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Repeat className="h-5 w-5 text-primary" />
            <CardTitle>Assinatura Recorrente</CardTitle>
          </div>
          <CardDescription>
            Gerencie sua assinatura e forma de pagamento
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Subscription Details */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="p-4 bg-muted/50 rounded-xl border border-border/50 hover:border-border transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <CreditCard className="h-4 w-4 text-blue-500" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">Cartão</span>
              </div>
              <p className="font-semibold">{formatCardDisplay(subscription)}</p>
              {canUpdateCard(subscription) && (
                <Button
                  variant="link"
                  size="sm"
                  className="p-0 h-auto text-xs text-primary mt-1"
                  onClick={() => setShowUpdateCard(true)}
                >
                  Atualizar cartão
                </Button>
              )}
            </div>

            <div className="p-4 bg-muted/50 rounded-xl border border-border/50 hover:border-border transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <Calendar className="h-4 w-4 text-green-500" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">Próxima cobrança</span>
              </div>
              <p className="font-semibold">
                {subscription.status === 'authorized'
                  ? formatNextPaymentDate(subscription)
                  : subscription.status === 'paused'
                  ? 'Pausada'
                  : 'N/A'}
              </p>
              {subscription.status === 'authorized' && (
                <p className="text-xs text-muted-foreground mt-1">
                  {formatCurrency(subscription.transactionAmount)}
                </p>
              )}
            </div>

            <div className="p-4 bg-muted/50 rounded-xl border border-border/50 hover:border-border transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Clock className="h-4 w-4 text-purple-500" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">Membro desde</span>
              </div>
              <p className="font-semibold">
                {new Date(subscription.createdAt).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric'
                })}
              </p>
            </div>

            <div className="p-4 bg-muted/50 rounded-xl border border-border/50 hover:border-border transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                  <Repeat className="h-4 w-4 text-orange-500" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">Frequência</span>
              </div>
              <p className="font-semibold">
                {getFrequencyLabel(subscription.frequencyType)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Cobrança automática
              </p>
            </div>
          </div>

          {/* Failed payments warning */}
          {subscription.failedPayments > 0 && (
            <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-600 dark:text-yellow-400">
                  Problema com cobrança
                </p>
                <p className="text-sm text-yellow-600/80 dark:text-yellow-400/80">
                  Houve {subscription.failedPayments} tentativa(s) de cobrança sem sucesso.
                  Por favor, atualize seu cartão.
                </p>
              </div>
            </div>
          )}

          {/* Paused warning */}
          {subscription.status === 'paused' && (
            <div className="flex items-start gap-3 p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg">
              <Pause className="h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-orange-600 dark:text-orange-400">
                  Assinatura pausada
                </p>
                <p className="text-sm text-orange-600/80 dark:text-orange-400/80">
                  Você não será cobrado enquanto a assinatura estiver pausada.
                  Seus benefícios também estão suspensos.
                </p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 border-t">
            <div className="flex flex-wrap gap-3">
              {canPauseSubscription(subscription) && (
                <Button
                  variant="outline"
                  onClick={() => setConfirmAction('pause')}
                  className="hover:bg-orange-500/10 hover:text-orange-600 hover:border-orange-500/50"
                >
                  <Pause className="h-4 w-4 mr-2" />
                  Pausar Assinatura
                </Button>
              )}

              {canResumeSubscription(subscription) && (
                <Button
                  variant="default"
                  onClick={() => setConfirmAction('resume')}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Reativar Assinatura
                </Button>
              )}

              {canCancelSubscription(subscription) && (
                <Button
                  variant="outline"
                  className="text-red-500 hover:text-red-600 hover:bg-red-500/10 hover:border-red-500/50"
                  onClick={() => setConfirmAction('cancel')}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancelar
                </Button>
              )}

              <Button
                variant="ghost"
                onClick={() => setShowHistory(!showHistory)}
                className={showHistory ? 'bg-muted' : ''}
              >
                <History className="h-4 w-4 mr-2" />
                Histórico
                {showHistory ? (
                  <ChevronUp className="h-4 w-4 ml-1" />
                ) : (
                  <ChevronDown className="h-4 w-4 ml-1" />
                )}
              </Button>
            </div>
          </div>

          {/* Payment History */}
          {showHistory && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 pt-2 border-t">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold flex items-center gap-2">
                  <History className="h-4 w-4 text-muted-foreground" />
                  Histórico de Cobranças
                </h4>
                {payments.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {payments.length} cobrança(s)
                  </span>
                )}
              </div>

              {payments.length === 0 ? (
                <div className="text-center py-8 bg-muted/30 rounded-xl border border-dashed">
                  <History className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhuma cobrança registrada ainda</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    As cobranças aparecerão aqui após o primeiro pagamento
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {payments.map((payment, index) => (
                    <div
                      key={payment.id}
                      className={`
                        flex items-center justify-between p-4 rounded-xl border transition-colors
                        ${payment.status === 'approved'
                          ? 'bg-green-500/5 border-green-500/20 hover:border-green-500/40'
                          : payment.status === 'rejected'
                          ? 'bg-red-500/5 border-red-500/20 hover:border-red-500/40'
                          : 'bg-yellow-500/5 border-yellow-500/20 hover:border-yellow-500/40'
                        }
                      `}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`
                          w-10 h-10 rounded-full flex items-center justify-center
                          ${payment.status === 'approved'
                            ? 'bg-green-500/20'
                            : payment.status === 'rejected'
                            ? 'bg-red-500/20'
                            : 'bg-yellow-500/20'
                          }
                        `}>
                          {getPaymentStatusIcon(payment.status)}
                        </div>
                        <div>
                          <p className="font-semibold">
                            {formatCurrency(payment.amount)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(payment.paymentDate).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge
                          variant={payment.status === 'approved' ? 'success' : payment.status === 'rejected' ? 'destructive' : 'warning'}
                        >
                          {getPaymentStatusLabel(payment.status)}
                        </Badge>
                        {index === 0 && payment.status === 'approved' && (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                            Mais recente
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={confirmAction !== null} onOpenChange={() => setConfirmAction(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader className="text-center sm:text-left">
            <div className={`
              mx-auto sm:mx-0 w-14 h-14 rounded-full flex items-center justify-center mb-4
              ${confirmAction === 'pause'
                ? 'bg-orange-500/20'
                : confirmAction === 'resume'
                ? 'bg-green-500/20'
                : 'bg-red-500/20'
              }
            `}>
              {confirmAction === 'pause' && <Pause className="h-7 w-7 text-orange-500" />}
              {confirmAction === 'resume' && <Play className="h-7 w-7 text-green-500" />}
              {confirmAction === 'cancel' && <XCircle className="h-7 w-7 text-red-500" />}
            </div>
            <DialogTitle className="text-xl">
              {confirmAction === 'pause' && 'Pausar Assinatura'}
              {confirmAction === 'resume' && 'Reativar Assinatura'}
              {confirmAction === 'cancel' && 'Cancelar Assinatura'}
            </DialogTitle>
            <DialogDescription className="text-base">
              {confirmAction === 'pause' && (
                'Ao pausar sua assinatura, você não será cobrado e seus benefícios serão suspensos. Você pode reativar a qualquer momento.'
              )}
              {confirmAction === 'resume' && (
                'Ao reativar sua assinatura, você voltará a ser cobrado e terá acesso a todos os benefícios do seu plano.'
              )}
              {confirmAction === 'cancel' && (
                'Ao cancelar sua assinatura, você perderá todos os benefícios do clube. Esta ação não pode ser desfeita, mas você pode criar uma nova assinatura no futuro.'
              )}
            </DialogDescription>
          </DialogHeader>

          {confirmAction === 'cancel' && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600 dark:text-red-400">
                Você perderá acesso a todos os benefícios imediatamente após o cancelamento.
              </p>
            </div>
          )}

          {confirmAction === 'resume' && (
            <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-green-600 dark:text-green-400">
                Sua próxima cobrança será processada automaticamente na data agendada.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setConfirmAction(null)}
              disabled={actionLoading}
              className="w-full sm:w-auto"
            >
              Voltar
            </Button>
            <Button
              variant={confirmAction === 'cancel' ? 'destructive' : 'default'}
              onClick={() => {
                if (confirmAction === 'pause') handlePause()
                else if (confirmAction === 'resume') handleResume()
                else if (confirmAction === 'cancel') handleCancel()
              }}
              disabled={actionLoading}
              className="w-full sm:w-auto"
            >
              {actionLoading ? (
                <Loading size="sm" />
              ) : (
                <>
                  {confirmAction === 'pause' && (
                    <>
                      <Pause className="h-4 w-4 mr-2" />
                      Confirmar Pausa
                    </>
                  )}
                  {confirmAction === 'resume' && (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Confirmar Reativação
                    </>
                  )}
                  {confirmAction === 'cancel' && (
                    <>
                      <XCircle className="h-4 w-4 mr-2" />
                      Confirmar Cancelamento
                    </>
                  )}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Card Dialog */}
      <Dialog open={showUpdateCard} onOpenChange={setShowUpdateCard}>
        <DialogContent className="max-w-md">
          <DialogHeader className="text-center sm:text-left">
            <div className="mx-auto sm:mx-0 w-14 h-14 rounded-full bg-blue-500/20 flex items-center justify-center mb-4">
              <CreditCard className="h-7 w-7 text-blue-500" />
            </div>
            <DialogTitle className="text-xl">Atualizar Cartão</DialogTitle>
            <DialogDescription className="text-base">
              Insira os dados do novo cartão de crédito para continuar com suas cobranças.
            </DialogDescription>
          </DialogHeader>
          <CardTokenizationForm
            amount={subscription?.transactionAmount || 0}
            onTokenGenerated={handleUpdateCard}
            onCancel={() => setShowUpdateCard(false)}
            disabled={actionLoading}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
