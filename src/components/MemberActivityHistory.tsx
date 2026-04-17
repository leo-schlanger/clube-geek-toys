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
  Coins,
  Gift,
  FileText,
} from 'lucide-react'
import { getMemberLogs, type AuditLog } from '../lib/logs'

const ACTION_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  member_activated: { label: 'Assinatura Ativada', color: 'text-green-500', icon: UserCheck },
  member_created: { label: 'Cadastro Realizado', color: 'text-blue-500', icon: UserPlus },
  member_updated: { label: 'Dados Atualizados', color: 'text-yellow-500', icon: FileText },
  member_deactivated: { label: 'Assinatura Cancelada', color: 'text-red-500', icon: UserX },
  payment_created: { label: 'Pagamento Iniciado', color: 'text-blue-500', icon: CreditCard },
  payment_confirmed: { label: 'Pagamento Confirmado', color: 'text-green-500', icon: CheckCircle },
  payment_failed: { label: 'Pagamento Falhou', color: 'text-red-500', icon: XCircle },
  points_added: { label: 'Pontos Recebidos', color: 'text-purple-500', icon: Coins },
  bonus_points_added: { label: 'Pontos Bônus', color: 'text-purple-500', icon: Gift },
  points_redeemed: { label: 'Pontos Resgatados', color: 'text-blue-500', icon: Gift },
}

function getActionConfig(action: string) {
  return ACTION_CONFIG[action] ?? {
    label: action.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
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
  memberId: string
  /** Max items to fetch and display. When set, the "show all" toggle is hidden. */
  limit?: number
}

export function MemberActivityHistory({ memberId, limit }: MemberActivityHistoryProps) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    async function fetchLogs() {
      setLoading(true)
      const memberLogs = await getMemberLogs(memberId, limit ?? 20)
      setLogs(memberLogs)
      setLoading(false)
    }
    fetchLogs()
  }, [memberId, limit])

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
        {logs.length === 0 ? (
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
                    <ChevronUp className="h-4 w-4 mr-1" />
                    Ver menos
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4 mr-1" />
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
