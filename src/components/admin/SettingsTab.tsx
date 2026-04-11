import { useEffect, useState, type ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Badge } from '../ui/badge'
import { toast } from 'sonner'
import { Save, RotateCcw, Star, Crown, Sparkles, AlertTriangle, Loader2 } from 'lucide-react'
import { getSettings, updateSettings, type SettingDefinition } from '../../lib/settings'

interface SettingsState {
  values: Record<string, unknown>
  catalogue: SettingDefinition[]
}

const PLAN_KEYS = ['silver', 'gold', 'black'] as const
type PlanKey = typeof PLAN_KEYS[number]

const planIcons: Record<PlanKey, ReactNode> = {
  silver: <Star className="h-5 w-5" />,
  gold: <Crown className="h-5 w-5" />,
  black: <Sparkles className="h-5 w-5" />,
}

const planColors: Record<PlanKey, string> = {
  silver: 'from-slate-400 to-slate-600',
  gold: 'from-yellow-400 to-yellow-600',
  black: 'from-violet-600 to-purple-800',
}

export function SettingsTab() {
  const [state, setState] = useState<SettingsState | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Record<string, unknown>>({})

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const data = await getSettings()
      if (!cancelled) {
        if (data) {
          setState(data)
          setDraft({ ...data.values })
        } else {
          toast.error('Não foi possível carregar as configurações.')
        }
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const hasChanges = state
    ? Object.keys(draft).some((k) => JSON.stringify(draft[k]) !== JSON.stringify(state.values[k]))
    : false

  const setValue = (key: string, value: unknown) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    if (!state) return
    setSaving(true)
    try {
      // Send only changed keys
      const changed: Record<string, unknown> = {}
      for (const k of Object.keys(draft)) {
        if (JSON.stringify(draft[k]) !== JSON.stringify(state.values[k])) {
          changed[k] = draft[k]
        }
      }
      const result = await updateSettings(changed)
      if (result) {
        setState({ values: result.values, catalogue: state.catalogue })
        setDraft({ ...result.values })
        toast.success('Configurações salvas com sucesso!')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    if (!state) return
    setDraft({ ...state.values })
    toast.success('Alterações descartadas.')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!state) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          Falha ao carregar configurações.
        </CardContent>
      </Card>
    )
  }

  const num = (key: string): number => {
    const v = draft[key]
    return typeof v === 'number' ? v : 0
  }

  return (
    <div className="space-y-6">
      <Card className="border-blue-500/40 bg-blue-500/5">
        <CardContent className="p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-blue-500 flex-shrink-0" />
          <p className="text-sm text-blue-700 dark:text-blue-300">
            Configurações persistidas no banco. As alterações entram em vigor imediatamente
            e ficam registradas no audit log.
          </p>
        </CardContent>
      </Card>

      {/* Plans Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Configuração de Planos</CardTitle>
          <CardDescription>Defina preços e descontos de cada plano</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-6">
            {PLAN_KEYS.map((planKey) => (
              <div
                key={planKey}
                className={`rounded-xl bg-gradient-to-br ${planColors[planKey]} p-[1px]`}
              >
                <div className="bg-card rounded-xl p-4 space-y-4">
                  <div className="flex items-center gap-2 text-foreground">
                    {planIcons[planKey]}
                    <span className="font-bold capitalize">{planKey}</span>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">Preço Mensal (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={num(`pricing.${planKey}_monthly`)}
                        onChange={(e) => setValue(`pricing.${planKey}_monthly`, parseFloat(e.target.value) || 0)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Preço Anual (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={num(`pricing.${planKey}_annual`)}
                        onChange={(e) => setValue(`pricing.${planKey}_annual`, parseFloat(e.target.value) || 0)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Desconto Produtos (%)</Label>
                      <Input
                        type="number"
                        value={num(`plan.${planKey}.discount_products`)}
                        onChange={(e) => setValue(`plan.${planKey}.discount_products`, parseInt(e.target.value) || 0)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Desconto Serviços (%)</Label>
                      <Input
                        type="number"
                        value={num(`plan.${planKey}.discount_services`)}
                        onChange={(e) => setValue(`plan.${planKey}.discount_services`, parseInt(e.target.value) || 0)}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Points */}
      <Card>
        <CardHeader>
          <CardTitle>Multiplicadores de Pontos</CardTitle>
          <CardDescription>Quantos pontos cada plano ganha por real gasto</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            {PLAN_KEYS.map((planKey) => (
              <div key={planKey} className="flex items-center gap-3 p-4 bg-muted rounded-lg">
                <Badge variant={planKey} className="gap-1">
                  {planIcons[planKey]}
                  {planKey}
                </Badge>
                <div className="flex-1">
                  <Input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={num(`points.multiplier_${planKey}`)}
                    onChange={(e) => setValue(`points.multiplier_${planKey}`, parseFloat(e.target.value) || 0)}
                    className="w-24"
                  />
                </div>
                <span className="text-sm text-muted-foreground">pts/R$</span>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <Label className="text-xs">Dias até expiração de pontos</Label>
            <Input
              type="number"
              value={num('points.expiry_days')}
              onChange={(e) => setValue('points.expiry_days', parseInt(e.target.value) || 0)}
              className="mt-1 max-w-xs"
            />
          </div>
        </CardContent>
      </Card>

      {/* Payment guards */}
      <Card>
        <CardHeader>
          <CardTitle>Proteções de Pagamento</CardTitle>
          <CardDescription>Janela para bloquear pagamentos duplicados</CardDescription>
        </CardHeader>
        <CardContent>
          <Label className="text-xs">Dias da janela</Label>
          <Input
            type="number"
            value={num('payment.duplicate_window_days')}
            onChange={(e) => setValue('payment.duplicate_window_days', parseInt(e.target.value) || 0)}
            className="mt-1 max-w-xs"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Bloqueia novos pagamentos do mesmo membro dentro deste período.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={handleReset} disabled={!hasChanges || saving}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Descartar
        </Button>
        <Button onClick={handleSave} disabled={!hasChanges || saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Salvar Configurações
        </Button>
      </div>
    </div>
  )
}
