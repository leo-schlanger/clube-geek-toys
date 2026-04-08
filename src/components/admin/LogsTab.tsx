import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { FileText, Clock, AlertTriangle, Bug, Monitor, Server, RefreshCw } from 'lucide-react'
import type { AuditLog, ErrorLog, ErrorStats } from '../../lib/logs'
import { getErrorLogs, getErrorStats } from '../../lib/logs'

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  member_activated: { label: 'Membro Ativado', color: 'text-green-500' },
  member_created: { label: 'Membro Cadastrado', color: 'text-blue-500' },
  member_updated: { label: 'Membro Atualizado', color: 'text-yellow-500' },
  member_deactivated: { label: 'Membro Desativado', color: 'text-red-500' },
  payment_created: { label: 'Pagamento Registrado', color: 'text-blue-500' },
  payment_confirmed: { label: 'Pagamento Confirmado', color: 'text-green-500' },
  payment_failed: { label: 'Pagamento Falhou', color: 'text-red-500' },
  points_added: { label: 'Pontos Adicionados', color: 'text-purple-500' },
  bonus_points_added: { label: 'Pontos Bonus', color: 'text-purple-500' },
  points_redeemed: { label: 'Pontos Resgatados', color: 'text-blue-500' },
  role_updated: { label: 'Cargo Atualizado', color: 'text-orange-500' },
  user_disabled: { label: 'Usuario Desativado', color: 'text-red-500' },
  user_created: { label: 'Usuario Criado', color: 'text-blue-500' },
}

function getActionLabel(action: string): { label: string; color: string } {
  return ACTION_LABELS[action] ?? { label: action.replace(/_/g, ' '), color: 'text-muted-foreground' }
}

const SEVERITY_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  fatal: { label: 'FATAL', color: 'text-red-700 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-950' },
  error: { label: 'ERROR', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/50' },
  warning: { label: 'WARN', color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-950/50' },
  info: { label: 'INFO', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/50' },
  debug: { label: 'DEBUG', color: 'text-muted-foreground', bg: 'bg-muted/30' },
}

interface LogsTabProps {
  logs: AuditLog[]
  logDateFrom: string
  logDateTo: string
  onDateFromChange: (value: string) => void
  onDateToChange: (value: string) => void
}

type SubTab = 'audit' | 'errors'

export function LogsTab({
  logs,
  logDateFrom,
  logDateTo,
  onDateFromChange,
  onDateToChange,
}: LogsTabProps) {
  const [subTab, setSubTab] = useState<SubTab>('audit')
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([])
  const [errorStats, setErrorStats] = useState<ErrorStats | null>(null)
  const [loadingErrors, setLoadingErrors] = useState(false)
  const [expandedError, setExpandedError] = useState<string | null>(null)
  const [errorFilter, setErrorFilter] = useState<{ severity?: string; source?: string }>({})

  const fetchErrors = useCallback(async () => {
    setLoadingErrors(true)
    try {
      const [logsData, statsData] = await Promise.all([
        getErrorLogs({ ...errorFilter, limit: 100 }),
        getErrorStats(),
      ])
      setErrorLogs(logsData)
      setErrorStats(statsData)
    } catch {
      // Silently fail
    } finally {
      setLoadingErrors(false)
    }
  }, [errorFilter])

  useEffect(() => {
    if (subTab === 'errors') {
      fetchErrors()
    }
  }, [subTab, fetchErrors])

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
    <div className="space-y-4">
      {/* Sub-tab selector */}
      <div className="flex gap-2">
        <Button
          variant={subTab === 'audit' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSubTab('audit')}
        >
          <Clock className="h-4 w-4 mr-2" />
          Auditoria
        </Button>
        <Button
          variant={subTab === 'errors' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSubTab('errors')}
        >
          <Bug className="h-4 w-4 mr-2" />
          Erros
          {errorStats && Number(errorStats.errors_24h) > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-red-500 text-white">
              {errorStats.errors_24h}
            </span>
          )}
        </Button>
      </div>

      {/* Audit Logs */}
      {subTab === 'audit' && (
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <CardTitle>Historico de Atividade</CardTitle>
                <CardDescription>Acompanhe as ultimas acoes registradas no sistema</CardDescription>
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
                            <span>Membro: <span className="text-foreground">{log.member_id.slice(0, 10)}...</span></span>
                          )}
                          {log.payment_id && (
                            <span>Pagamento: <span className="text-foreground">{log.payment_id.slice(0, 10)}...</span></span>
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
                  <p className="text-xs text-muted-foreground mt-1">Os logs aparecem aqui automaticamente conforme o sistema e utilizado</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Logs */}
      {subTab === 'errors' && (
        <div className="space-y-4">
          {/* Stats cards */}
          {errorStats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold">{errorStats.last_24h}</p>
                  <p className="text-xs text-muted-foreground">Ultimas 24h</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold">{errorStats.last_7d}</p>
                  <p className="text-xs text-muted-foreground">Ultimos 7 dias</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-red-500">{errorStats.errors_24h}</p>
                  <p className="text-xs text-muted-foreground">Erros 24h</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-red-700">{errorStats.fatal_24h}</p>
                  <p className="text-xs text-muted-foreground">Fatais 24h</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Filters */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <CardTitle>Error Logs</CardTitle>
                  <CardDescription>Erros capturados do frontend e backend</CardDescription>
                </div>
                <div className="flex gap-2">
                  <select
                    className="px-3 py-1.5 text-sm border rounded-md bg-background"
                    value={errorFilter.severity || ''}
                    onChange={(e) => setErrorFilter(f => ({ ...f, severity: e.target.value || undefined }))}
                  >
                    <option value="">Todos</option>
                    <option value="fatal">Fatal</option>
                    <option value="error">Error</option>
                    <option value="warning">Warning</option>
                  </select>
                  <select
                    className="px-3 py-1.5 text-sm border rounded-md bg-background"
                    value={errorFilter.source || ''}
                    onChange={(e) => setErrorFilter(f => ({ ...f, source: e.target.value || undefined }))}
                  >
                    <option value="">Todas fontes</option>
                    <option value="frontend">Frontend</option>
                    <option value="backend">Backend</option>
                  </select>
                  <Button variant="outline" size="sm" onClick={fetchErrors} disabled={loadingErrors}>
                    <RefreshCw className={`h-4 w-4 ${loadingErrors ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {errorLogs.length > 0 ? (
                  errorLogs.map((err) => {
                    const style = SEVERITY_STYLES[err.severity] || SEVERITY_STYLES.error
                    const isExpanded = expandedError === err.id
                    return (
                      <div
                        key={err.id}
                        className={`rounded-lg border border-border/50 ${style.bg} cursor-pointer transition-colors hover:border-border`}
                        onClick={() => setExpandedError(isExpanded ? null : err.id)}
                      >
                        <div className="flex items-start gap-3 p-3">
                          <div className="mt-0.5">
                            {err.source === 'frontend'
                              ? <Monitor className="h-4 w-4 text-muted-foreground" />
                              : <Server className="h-4 w-4 text-muted-foreground" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-xs font-bold ${style.color}`}>{style.label}</span>
                              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{err.source}</span>
                              <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
                                {new Date(err.createdAt).toLocaleString('pt-BR')}
                              </span>
                            </div>
                            <p className="text-sm font-mono truncate">{err.message}</p>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="px-3 pb-3 space-y-2 border-t border-border/30 pt-2">
                            {err.url && (
                              <p className="text-xs text-muted-foreground"><span className="font-medium">URL:</span> {err.url}</p>
                            )}
                            {err.userId && (
                              <p className="text-xs text-muted-foreground"><span className="font-medium">User:</span> {err.userId.slice(0, 12)}...</p>
                            )}
                            {err.ipAddress && (
                              <p className="text-xs text-muted-foreground"><span className="font-medium">IP:</span> {err.ipAddress}</p>
                            )}
                            {err.context && Object.keys(err.context).length > 0 && (
                              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">{JSON.stringify(err.context, null, 2)}</pre>
                            )}
                            {err.stack && (
                              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-48">{err.stack}</pre>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
                ) : (
                  <div className="text-center py-12">
                    <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground font-medium">Nenhum erro registrado</p>
                    <p className="text-xs text-muted-foreground mt-1">Erros do frontend e backend aparecem aqui automaticamente</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
