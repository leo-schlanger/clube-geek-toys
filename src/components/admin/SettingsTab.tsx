import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { toast } from 'sonner'
import {
  Save,
  RotateCcw,
  AlertTriangle,
  Loader2,
  Database,
  Palette,
  Building2,
  BadgePercent,
  Bell,
} from 'lucide-react'
import { getSettings, updateSettings, type SettingDefinition } from '../../lib/settings'
import { ThemeToggle } from '../ThemeToggle'
import { MelhorEnvioCard } from './MelhorEnvioCard'
import { CLUB_PLAN, CURRENT_PAYMENT_TYPE, MEMBER_DISCOUNT_PERCENT, paymentTypeSuffix } from '../../types'
import { formatCurrency } from '../../lib/utils'

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

  const bool = (key: string): boolean => draft[key] === true

  return (
    <div className="space-y-6">
      <Card className="border-blue-500/40 bg-blue-500/5">
        <CardContent className="p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-blue-500 shrink-0" />
          <p className="text-sm text-blue-700 dark:text-blue-300">
            Configurações persistidas no banco. As alterações entram em vigor imediatamente
            e ficam registradas no audit log.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            Aparência
          </CardTitle>
          <CardDescription>
            Tema claro, escuro ou seguir o sistema. Preferência salva neste navegador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeToggle variant="segmented" />
        </CardContent>
      </Card>

      {/* Plan Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Configuração do Plano</CardTitle>
          <CardDescription>Preço do clube e o desconto que o membro tem na loja</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6 max-w-xl">
            <div>
              <Label className="text-xs">Preço do plano</Label>
              {/* Written into the contract and the Terms; changing it is a deploy. */}
              <p className="mt-1 flex h-10 items-center text-sm font-semibold">
                {formatCurrency(CLUB_PLAN.price)}{paymentTypeSuffix(CURRENT_PAYMENT_TYPE)}
              </p>
              <p className="text-xs text-muted-foreground">
                Fixo — está no contrato e nos Termos de Uso. Para mudar, fale com o desenvolvedor.
              </p>
            </div>
            <div>
              <Label className="text-xs">Desconto do membro na loja</Label>
              {/* Fixed in the Terms of Use; changing it is a deploy, not a setting. */}
              <p className="mt-1 flex h-10 items-center text-sm font-semibold">
                {MEMBER_DISCOUNT_PERCENT}%
              </p>
              <p className="text-xs text-muted-foreground">
                Fixo — está nos Termos de Uso. Para mudar, fale com o desenvolvedor.
              </p>
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Canal Atacado
          </CardTitle>
          <CardDescription>
            Desligado, /atacado vira lista de espera: catálogo e cadastro de CNPJ no ar, sem
            carrinho nem checkout. A API recusa qualquer pedido de atacado enquanto estiver assim.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex max-w-xl cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-primary"
              checked={bool('wholesale.sales_open')}
              onChange={(e) => setValue('wholesale.sales_open', e.target.checked)}
            />
            <span>
              <span className="text-sm font-medium">Vendendo no atacado</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {bool('wholesale.sales_open')
                  ? 'Atacadistas aprovados podem comprar com 25% de desconto.'
                  : 'As lojas continuam se cadastrando; avisamos elas quando você ligar isto.'}
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BadgePercent className="h-5 w-5 text-primary" />
            Promoção da loja online
          </CardTitle>
          <CardDescription>
            Desconto que vale para todo mundo que compra pelo site. Só um desconto vale por
            pedido: o maior entre esta promoção, o cupom e o desconto de membro.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex max-w-xl cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-primary"
              checked={bool('shop.online_discount_enabled')}
              onChange={(e) => setValue('shop.online_discount_enabled', e.target.checked)}
            />
            <span className="text-sm font-medium">Promoção ligada</span>
          </label>
          <div className="max-w-xs">
            <Label className="text-xs" htmlFor="promo-percent">
              Desconto (%)
            </Label>
            <Input
              id="promo-percent"
              type="number"
              min={0}
              max={90}
              value={num('shop.online_discount_percent')}
              onChange={(e) =>
                setValue('shop.online_discount_percent', parseFloat(e.target.value) || 0)
              }
              className="mt-1"
            />
          </div>
          <label className="flex max-w-xl cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-primary"
              checked={bool('shop.online_discount_banner_enabled')}
              onChange={(e) => setValue('shop.online_discount_banner_enabled', e.target.checked)}
            />
            <span className="text-sm font-medium">Mostrar aviso no topo da loja</span>
          </label>
          <div className="max-w-xl">
            <Label className="text-xs" htmlFor="promo-banner">
              Texto do aviso
            </Label>
            <Input
              id="promo-banner"
              maxLength={160}
              value={typeof draft['shop.online_discount_banner_text'] === 'string' ? (draft['shop.online_discount_banner_text'] as string) : ''}
              onChange={(e) => setValue('shop.online_discount_banner_text', e.target.value)}
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Avisos de pagamento para a equipe
          </CardTitle>
          <CardDescription>Como a equipe fica sabendo quando entra um pagamento.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex max-w-xl cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-primary"
              checked={bool('notifications.admin_payment_inapp')}
              onChange={(e) => setValue('notifications.admin_payment_inapp', e.target.checked)}
            />
            <span className="text-sm font-medium">Avisar no sino do painel</span>
          </label>
          <label className="flex max-w-xl cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-primary"
              checked={bool('notifications.admin_payment_email')}
              onChange={(e) => setValue('notifications.admin_payment_email', e.target.checked)}
            />
            <span className="text-sm font-medium">Mandar e-mail</span>
          </label>
          <div className="max-w-xs">
            <Label className="text-xs" htmlFor="notify-min">
              Só mandar e-mail a partir de (R$)
            </Label>
            <Input
              id="notify-min"
              type="number"
              min={0}
              step="0.01"
              value={num('notifications.admin_payment_min_amount')}
              onChange={(e) =>
                setValue('notifications.admin_payment_min_amount', parseFloat(e.target.value) || 0)
              }
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">0 = todo pagamento manda e-mail.</p>
          </div>
        </CardContent>
      </Card>

      <MelhorEnvioCard />

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={handleReset} disabled={!hasChanges || saving} className="shrink-0">
          <RotateCcw className="h-4 w-4" />
          Descartar
        </Button>
        <Button onClick={handleSave} disabled={!hasChanges || saving} className="shrink-0">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
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
