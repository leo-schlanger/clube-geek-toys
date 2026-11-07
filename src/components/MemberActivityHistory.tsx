import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Loading } from './ui/loading'
import {
  Clock,
  History,
  ChevronDown,
  ChevronUp,
  UserCheck,
  UserPlus,
  UserX,
  CreditCard,
  CheckCircle,
  XCircle,
  FileText,
} from 'lucide-react'
import { getMyActivity, type MemberActivity } from '../lib/members'

// Keys are the audit actions GET /members/me/activity lets through (MEMBER_VISIBLE_ACTIONS).
const GREEN = 'text-green-700 dark:text-green-500'
const BLUE = 'text-blue-700 dark:text-blue-400'
const AMBER = 'text-amber-700 dark:text-amber-500'
const RED = 'text-red-700 dark:text-red-400'
const ACTION_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  'member.activated': { label: 'Assinatura ativada', color: GREEN, icon: UserCheck },
  'member.updated': { label: 'Dados atualizados', color: AMBER, icon: FileText },
  'profile.updated': { label: 'Perfil atualizado', color: AMBER, icon: FileText },
  member_expired: { label: 'Assinatura vencida', color: RED, icon: UserX },
  contract_signed: { label: 'Contrato assinado', color: BLUE, icon: UserPlus },
  'payment.pix_created': { label: 'PIX gerado', color: BLUE, icon: CreditCard },
  'payment.card_created': { label: 'Pagamento com cartão iniciado', color: BLUE, icon: CreditCard },
  'payment.pix_confirmed': { label: 'Pagamento confirmado', color: GREEN, icon: CheckCircle },
  'payment.received': { label: 'Pagamento confirmado', color: GREEN, icon: CheckCircle },
  'payment.failed': { label: 'Pagamento não aprovado', color: RED, icon: XCircle },
  'payment.refunded': { label: 'Pagamento estornado', color: AMBER, icon: XCircle },
  'subscription.cancelled': { label: 'Recorrência cancelada', color: RED, icon: UserX },
  'subscription.canceled': { label: 'Recorrência cancelada', color: RED, icon: UserX },
}

function getActionConfig(action: string) {
  return ACTION_CONFIG[action] ?? {
    label: 'Atualização na conta',
    color: 'text-muted-foreground',
    icon: Clock,
  }
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 7) {
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }
  if (diffDays > 0) return `${diffDays} dia${diffDays > 1 ? 's' : ''} atrás`
  if (diffHours > 0) return `${diffHours}h atrás`
  if (diffMins > 0) return `${diffMins}min atrás`
  return 'Agora'
}

interface MemberActivityHistoryProps {
  /** Max items to fetch and display. When set, the "show all" toggle is hidden. */
  limit?: number
}

/** The signed-in member's own timeline (GET /members/me/activity). */
export function MemberActivityHistory({ limit }: MemberActivityHistoryProps) {
  const [logs, setLogs] = useState<MemberActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let cancelled = false
    getMyActivity(limit ?? 20)
      .then((items) => {
        if (cancelled) return
        setLogs(items)
        setFailed(false)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [limit])

  const displayedLogs = limit ? logs : (showAll ? logs : logs.slice(0, 5))

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Histórico de Atividades
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Loading size="md" text="Carregando histórico..." />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Histórico de Atividades
        </CardTitle>
        <CardDescription>
          Acompanhe todas as ações relacionadas à sua conta
        </CardDescription>
      </CardHeader>
      <CardContent>
        {failed ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Não foi possível carregar o histórico agora. Tente de novo mais tarde.
          </p>
        ) : logs.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-2 opacity-30" />
            <p>Nenhuma atividade registrada ainda</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Timeline */}
            <div className="relative">
              {displayedLogs.map((log, index) => {
                const config = getActionConfig(log.action)
                const Icon = config.icon
                const isLast = index === displayedLogs.length - 1

                return (
                  <div key={log.id} className="flex gap-4 pb-4">
                    {/* Timeline line */}
                    <div className="flex flex-col items-center">
                      <div className={`p-2 rounded-full bg-muted ${config.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      {!isLast && (
                        <div className="w-0.5 flex-1 bg-border mt-2" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`font-medium text-sm ${config.color}`}>
                          {config.label}
                        </p>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatRelativeTime(log.timestamp)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(log.timestamp).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>

            {!limit && logs.length > 5 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? (
                  <>
                    <ChevronUp className="h-4 w-4" />
                    Ver menos
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" />
                    Ver mais ({logs.length - 5} atividades)
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
