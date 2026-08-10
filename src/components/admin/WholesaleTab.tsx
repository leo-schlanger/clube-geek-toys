import { useState, useEffect, useCallback } from 'react'
import { Building2, Check, X, Ban, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { WholesaleAccount, WholesaleStatus } from '../../types'
import {
  adminListWholesaleAccounts,
  adminReviewWholesale,
} from '../../lib/wholesale'
import { formatCnpj } from '../../lib/cnpj'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Loading } from '../ui/loading'

const STATUS_LABEL: Record<WholesaleStatus, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Recusado',
  disabled: 'Desativado',
}

const STATUS_VARIANT: Record<
  WholesaleStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'outline',
  approved: 'default',
  rejected: 'destructive',
  disabled: 'secondary',
}

/**
 * Admin: aprovar/recusar contas atacadistas (CNPJ + atividade vs objeto da compra).
 */
export function WholesaleTab() {
  const [accounts, setAccounts] = useState<WholesaleAccount[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<WholesaleStatus | 'all'>('pending')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminListWholesaleAccounts({
        status: filter === 'all' ? undefined : filter,
        limit: 100,
      })
      setAccounts(res.accounts)
      setTotal(res.total)
    } catch {
      toast.error('Falha ao carregar atacadistas')
      setAccounts([])
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    load()
  }, [load])

  async function handleAction(
    id: string,
    action: 'approve' | 'reject' | 'disable',
    reason?: string
  ) {
    setBusyId(id)
    try {
      await adminReviewWholesale(id, action, {
        rejectionReason: reason,
      })
      toast.success(
        action === 'approve'
          ? 'Atacadista aprovado'
          : action === 'reject'
            ? 'Cadastro recusado'
            : 'Conta desativada'
      )
      setRejectId(null)
      setRejectReason('')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
            <Building2 className="h-5 w-5 text-primary" />
            Atacadistas
          </h2>
          <p className="text-sm text-muted-foreground">
            Aprove só CNPJ cujo objeto social bate com o que vão comprar. Desconto 25% após
            aprovação.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['pending', 'approved', 'rejected', 'disabled', 'all'] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={filter === s ? 'default' : 'outline'}
            onClick={() => setFilter(s)}
          >
            {s === 'all' ? 'Todos' : STATUS_LABEL[s]}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loading size="lg" />
        </div>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhuma conta {filter === 'all' ? '' : STATUS_LABEL[filter].toLowerCase()} no momento.
            {filter === 'pending' && ' Cadastros de atacado aparecerão aqui.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{total} conta(s)</p>
          {accounts.map((acc) => (
            <Card key={acc.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-2">
                <div>
                  <CardTitle className="text-base">{acc.companyName}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {acc.tradeName ? `${acc.tradeName} · ` : ''}
                    CNPJ {formatCnpj(acc.cnpj)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {acc.contactName}
                    {acc.email ? ` · ${acc.email}` : ''}
                    {acc.phone ? ` · ${acc.phone}` : ''}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[acc.status]}>{STATUS_LABEL[acc.status]}</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {acc.businessActivity && (
                  <div className="rounded-md bg-muted/50 p-3 text-sm">
                    <span className="font-medium">Atividade / objeto: </span>
                    {acc.businessActivity}
                  </div>
                )}
                {acc.rejectionReason && (
                  <p className="text-sm text-destructive">Motivo: {acc.rejectionReason}</p>
                )}

                {rejectId === acc.id ? (
                  <div className="space-y-2 rounded-md border border-destructive/30 p-3">
                    <Label htmlFor={`reject-${acc.id}`}>Motivo da recusa</Label>
                    <Input
                      id={`reject-${acc.id}`}
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Ex.: CNAE não relacionado a revenda de artigos geek"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busyId === acc.id || !rejectReason.trim()}
                        onClick={() => handleAction(acc.id, 'reject', rejectReason.trim())}
                      >
                        Confirmar recusa
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setRejectId(null)
                          setRejectReason('')
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {acc.status !== 'approved' && (
                      <Button
                        size="sm"
                        disabled={busyId === acc.id}
                        onClick={() => handleAction(acc.id, 'approve')}
                      >
                        <Check className="h-4 w-4" />
                        Aprovar
                      </Button>
                    )}
                    {acc.status === 'pending' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === acc.id}
                        onClick={() => setRejectId(acc.id)}
                      >
                        <X className="h-4 w-4" />
                        Recusar
                      </Button>
                    )}
                    {acc.status === 'approved' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busyId === acc.id}
                        onClick={() => handleAction(acc.id, 'disable')}
                      >
                        <Ban className="h-4 w-4" />
                        Desativar
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export default WholesaleTab
