import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Input } from '../ui/input'
import { FileText, Clock } from 'lucide-react'
import type { AuditLog } from '../../lib/logs'

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  member_activated: { label: 'Membro Ativado', color: 'text-green-500' },
  member_created: { label: 'Membro Cadastrado', color: 'text-blue-500' },
  member_updated: { label: 'Membro Atualizado', color: 'text-yellow-500' },
  member_deactivated: { label: 'Membro Desativado', color: 'text-red-500' },
  payment_created: { label: 'Pagamento Registrado', color: 'text-blue-500' },
  payment_confirmed: { label: 'Pagamento Confirmado', color: 'text-green-500' },
  payment_failed: { label: 'Pagamento Falhou', color: 'text-red-500' },
  points_added: { label: 'Pontos Adicionados', color: 'text-purple-500' },
  bonus_points_added: { label: 'Pontos Bônus', color: 'text-purple-500' },
  points_redeemed: { label: 'Pontos Resgatados', color: 'text-blue-500' },
  role_updated: { label: 'Cargo Atualizado', color: 'text-orange-500' },
  user_disabled: { label: 'Usuário Desativado', color: 'text-red-500' },
  user_created: { label: 'Usuário Criado', color: 'text-blue-500' },
}

function getActionLabel(action: string): { label: string; color: string } {
  return ACTION_LABELS[action] ?? { label: action.replace(/_/g, ' '), color: 'text-muted-foreground' }
}

interface LogsTabProps {
  logs: AuditLog[]
  logDateFrom: string
  logDateTo: string
  onDateFromChange: (value: string) => void
  onDateToChange: (value: string) => void
}

export function LogsTab({
  logs,
  logDateFrom,
  logDateTo,
  onDateFromChange,
  onDateToChange,
}: LogsTabProps) {
  const filteredLogs = logs.filter((log) => {
    if (!logDateFrom && !logDateTo) return true
    const ts = new Date(log.timestamp)
    if (logDateFrom && ts < new Date(logDateFrom)) return false
    if (logDateTo) {
      const to = new Date(logDateTo)
      to.setHours(23, 59, 59, 999)
      if (ts > to) return false
    }
    return true
  })

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <CardTitle>Histórico de Atividade</CardTitle>
            <CardDescription>Acompanhe as últimas ações registradas no sistema</CardDescription>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Input
              type="date"
              value={logDateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
              className="flex-1 sm:w-auto"
              title="Data Inicial"
            />
            <Input
              type="date"
              value={logDateTo}
              onChange={(e) => onDateToChange(e.target.value)}
              className="flex-1 sm:w-auto"
              title="Data Final"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {filteredLogs.length > 0 ? (
            filteredLogs.map((log) => {
              const { label, color } = getActionLabel(log.action)
              return (
                <div key={log.id} className="flex items-start gap-4 p-4 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors">
                  <div className="p-2 rounded-full bg-primary/10 mt-0.5">
                    <Clock className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className={`font-semibold text-sm ${color}`}>{label}</p>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground font-mono">
                      {log.member_id && (
                        <span>Membro: <span className="text-foreground">{log.member_id.slice(0, 10)}…</span></span>
                      )}
                      {log.payment_id && (
                        <span>Pagamento: <span className="text-foreground">{log.payment_id.slice(0, 10)}…</span></span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground font-medium">Nenhum log de atividade encontrado</p>
              <p className="text-xs text-muted-foreground mt-1">Os logs aparecem aqui automaticamente conforme o sistema é utilizado</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
