import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Loading } from '../ui/loading'
import { toast } from 'sonner'
import { Plus, TicketPercent, Power, Trash2 } from 'lucide-react'
import {
  listCoupons,
  createCoupon,
  updateCoupon,
  deactivateCoupon,
  MAX_COUPON_CODE_LENGTH,
  type Coupon,
} from '../../lib/promo'
import { errorMessage } from '../../lib/api-client'
import { reportAdminError } from '../../lib/admin-errors'
import { formatCurrency } from '../../lib/utils'
import { useConfirm } from '../../hooks/useConfirm'

/**
 * Coupon codes.
 *
 * Deliberately a small screen: a coupon is a code, a percentage and a few
 * limits. Everything else the shop needs to say about pricing lives in the
 * online promotion, which is edited in Configurações — one number and one
 * sentence, no table needed.
 */

/** `2026-08-27T00:00:00.000Z` → `27/08/2026`, and nothing at all for null. */
function shortDate(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR')
}

function statusOf(c: Coupon): { label: string; variant: 'success' | 'outline' | 'destructive' } {
  if (!c.active) return { label: 'Inativo', variant: 'outline' }
  const now = Date.now()
  if (c.startsAt && new Date(c.startsAt).getTime() > now) {
    return { label: 'Agendado', variant: 'outline' }
  }
  if (c.endsAt && new Date(c.endsAt).getTime() <= now) {
    return { label: 'Expirado', variant: 'destructive' }
  }
  if (c.maxUses != null && c.usedCount >= c.maxUses) {
    return { label: 'Esgotado', variant: 'destructive' }
  }
  return { label: 'Ativo', variant: 'success' }
}

const EMPTY_FORM = {
  code: '',
  description: '',
  percent: '',
  endsAt: '',
  maxUses: '',
  maxUsesPerCustomer: '',
  minSubtotal: '',
}

export function CouponsTab() {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const confirm = useConfirm()

  const fetchCoupons = useCallback(async () => {
    setLoading(true)
    try {
      setCoupons(await listCoupons())
    } catch (error) {
      reportAdminError('coupon.list', error)
      toast.error(errorMessage(error, 'Erro ao carregar os cupons'))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount
    void fetchCoupons()
  }, [fetchCoupons])

  function update<K extends keyof typeof EMPTY_FORM>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  /** Empty means "no limit", which is not the same as zero. */
  function optionalNumber(raw: string): number | null {
    const trimmed = raw.trim()
    if (!trimmed) return null
    const n = Number(trimmed)
    return Number.isFinite(n) ? n : null
  }

  async function handleCreate() {
    const code = form.code.trim().toUpperCase()
    if (code.length < 3) {
      toast.error('O código precisa de pelo menos 3 caracteres.')
      return
    }
    const percent = Number(form.percent)
    if (!Number.isFinite(percent) || percent <= 0 || percent > 90) {
      toast.error('Informe um desconto entre 1% e 90%.')
      return
    }

    setSaving(true)
    try {
      await createCoupon({
        code,
        description: form.description.trim() || null,
        percent,
        // A date with no time means "up to the end of that day" to a person, so
        // send the end of it rather than midnight, which would expire the
        // coupon a full day early.
        endsAt: form.endsAt ? `${form.endsAt}T23:59:59.000Z` : null,
        maxUses: optionalNumber(form.maxUses),
        maxUsesPerCustomer: optionalNumber(form.maxUsesPerCustomer),
        minSubtotal: optionalNumber(form.minSubtotal),
      })
      toast.success(`Cupom ${code} criado`)
      setForm(EMPTY_FORM)
      void fetchCoupons()
    } catch (error) {
      reportAdminError('coupon.create', error)
      toast.error(errorMessage(error, 'Erro ao criar o cupom'))
    }
    setSaving(false)
  }

  async function handleToggle(coupon: Coupon) {
    setBusyId(coupon.id)
    try {
      await updateCoupon(coupon.id, { active: !coupon.active })
      toast.success(coupon.active ? `${coupon.code} desligado` : `${coupon.code} ligado`)
      void fetchCoupons()
    } catch (error) {
      reportAdminError('coupon.toggle', error)
      toast.error(errorMessage(error, 'Erro ao mudar o cupom'))
    }
    setBusyId(null)
  }

  async function handleDeactivate(coupon: Coupon) {
    const ok = await confirm({
      title: `Remover o cupom ${coupon.code}`,
      description:
        coupon.usedCount > 0
          ? `Ele já foi usado ${coupon.usedCount} vez(es). O cupom sai de circulação, mas os pedidos que ele pagou continuam apontando para ele.`
          : 'O cupom sai de circulação. Dá para ligar de novo depois.',
      confirmText: 'Remover',
      variant: 'destructive',
    })
    if (!ok) return

    setBusyId(coupon.id)
    try {
      await deactivateCoupon(coupon.id)
      toast.success('Cupom removido')
      void fetchCoupons()
    } catch (error) {
      reportAdminError('coupon.deactivate', error)
      toast.error(errorMessage(error, 'Erro ao remover o cupom'))
    }
    setBusyId(null)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TicketPercent className="h-5 w-5 text-primary" />
            Novo cupom
          </CardTitle>
          <CardDescription>
            Só um desconto vale por pedido — o maior entre cupom, desconto do site e desconto de
            membro. O desconto do site fica em Configurações.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="coupon-code">Código</Label>
              <Input
                id="coupon-code"
                placeholder="VERAO20"
                value={form.code}
                onChange={(e) => update('code', e.target.value.toUpperCase())}
                maxLength={MAX_COUPON_CODE_LENGTH}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                Letras, números e hífen. Até {MAX_COUPON_CODE_LENGTH} caracteres.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="coupon-percent">Desconto (%)</Label>
              <Input
                id="coupon-percent"
                type="number"
                min="1"
                max="90"
                step="1"
                inputMode="numeric"
                placeholder="20"
                value={form.percent}
                onChange={(e) => update('percent', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="coupon-description">Descrição (opcional)</Label>
            <Input
              id="coupon-description"
              placeholder="Campanha de verão no Instagram"
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              maxLength={200}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="coupon-ends">Válido até</Label>
              <Input
                id="coupon-ends"
                type="date"
                value={form.endsAt}
                onChange={(e) => update('endsAt', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coupon-max">Usos no total</Label>
              <Input
                id="coupon-max"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                placeholder="sem limite"
                value={form.maxUses}
                onChange={(e) => update('maxUses', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coupon-max-customer">Usos por pessoa</Label>
              <Input
                id="coupon-max-customer"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                placeholder="sem limite"
                value={form.maxUsesPerCustomer}
                onChange={(e) => update('maxUsesPerCustomer', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coupon-min">Compra mínima (R$)</Label>
              <Input
                id="coupon-min"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="sem mínimo"
                value={form.minSubtotal}
                onChange={(e) => update('minSubtotal', e.target.value)}
              />
            </div>
          </div>

          <Button onClick={() => void handleCreate()} disabled={saving}>
            {saving ? <Loading size="sm" /> : <Plus className="h-4 w-4" />}
            Criar cupom
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cupons</CardTitle>
          <CardDescription>{coupons.length} cupom(ns) cadastrado(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loading />
            </div>
          ) : coupons.length === 0 ? (
            <div className="py-12 text-center">
              <TicketPercent className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <p className="font-medium text-muted-foreground">Nenhum cupom cadastrado</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Crie um acima para divulgar no Instagram ou com influenciadores.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left text-sm font-medium">Código</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Desconto</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Usos</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Regras</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
                    <th className="px-4 py-3 text-right text-sm font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {coupons.map((c) => {
                    const status = statusOf(c)
                    return (
                      <tr
                        key={c.id}
                        className={`border-b transition-colors hover:bg-muted/50 ${c.active ? '' : 'opacity-60'}`}
                      >
                        <td className="px-4 py-4">
                          <p className="font-mono font-medium">{c.code}</p>
                          {c.description && (
                            <p className="text-xs text-muted-foreground">{c.description}</p>
                          )}
                        </td>
                        <td className="px-4 py-4 font-medium tabular-nums">{c.percent}%</td>
                        <td className="px-4 py-4 text-sm tabular-nums">
                          {c.usedCount}
                          {c.maxUses != null ? ` / ${c.maxUses}` : ''}
                        </td>
                        <td className="px-4 py-4 text-xs text-muted-foreground">
                          <div>até {shortDate(c.endsAt)}</div>
                          {c.maxUsesPerCustomer != null && (
                            <div>{c.maxUsesPerCustomer}x por pessoa</div>
                          )}
                          {c.minSubtotal != null && (
                            <div>mín. {formatCurrency(c.minSubtotal)}</div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              disabled={busyId === c.id}
                              onClick={() => void handleToggle(c)}
                              title={c.active ? 'Desligar cupom' : 'Ligar cupom'}
                            >
                              <Power className="h-4 w-4" />
                            </Button>
                            {c.active && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-red-500 hover:bg-red-500/10 hover:text-red-600"
                                disabled={busyId === c.id}
                                onClick={() => void handleDeactivate(c)}
                                title="Remover cupom"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
