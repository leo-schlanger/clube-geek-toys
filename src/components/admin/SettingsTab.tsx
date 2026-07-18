import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { toast } from 'sonner'
import { Save, RotateCcw, AlertTriangle, Loader2, Database } from 'lucide-react'
import { getSettings, updateSettings, type SettingDefinition } from '../../lib/settings'

interface SettingsState {
  values: Record<string, unknown>
  catalogue: SettingDefinition[]
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

      {/* Plan Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Configuração do Plano</CardTitle>
          <CardDescription>Defina o preço anual e o desconto do clube</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6 max-w-xl">
            <div>
              <Label className="text-xs">Preço Anual (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={num('pricing.club_annual')}
                onChange={(e) => setValue('pricing.club_annual', parseFloat(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Desconto em Produtos (%)</Label>
              <Input
                type="number"
                value={num('plan.club.discount_products')}
                onChange={(e) => setValue('plan.club.discount_products', parseInt(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
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

      {/* Backup Info */}
      <Card className="border-muted bg-muted/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
            <Database className="h-4 w-4" />
            Backups
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>Backups automaticos diarios as 03:00 (BRT)</li>
            <li>Retencao: 7 dias</li>
            <li>Local: <code className="text-xs bg-muted px-1 py-0.5 rounded">/opt/clube-geek-toys/backups/</code></li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
