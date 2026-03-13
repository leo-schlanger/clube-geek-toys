import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Badge } from '../ui/badge'
import { toast } from 'sonner'
import { Save, RotateCcw, Star, Crown, Sparkles, Gift, AlertTriangle } from 'lucide-react'
import { PLANS, POINTS_MULTIPLIER, POINTS_CONFIG } from '../../types'

// Note: In a production app, these would be stored in Firestore
// For now, we display the current configuration (read-only with visual edit)

export function SettingsTab() {
  const [hasChanges, setHasChanges] = useState(false)

  // Local state mirrors the constants (would be fetched from Firestore in production)
  const [plans, setPlans] = useState({
    silver: { ...PLANS.silver },
    gold: { ...PLANS.gold },
    black: { ...PLANS.black },
  })

  const [multipliers, setMultipliers] = useState({ ...POINTS_MULTIPLIER })
  const [rules, setRules] = useState([...POINTS_CONFIG.redemptionRules])

  const handlePlanChange = (plan: 'silver' | 'gold' | 'black', field: string, value: number) => {
    setPlans(prev => ({
      ...prev,
      [plan]: { ...prev[plan], [field]: value }
    }))
    setHasChanges(true)
  }

  const handleMultiplierChange = (plan: 'silver' | 'gold' | 'black', value: number) => {
    setMultipliers(prev => ({ ...prev, [plan]: value }))
    setHasChanges(true)
  }

  const handleRuleChange = (index: number, field: string, value: number | string) => {
    setRules(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
    setHasChanges(true)
  }

  const handleSave = () => {
    // In production, this would save to Firestore
    toast.info('Configurações serão salvas no banco de dados em breve. Por enquanto, as configurações são definidas no código.')
    setHasChanges(false)
  }

  const handleReset = () => {
    setPlans({
      silver: { ...PLANS.silver },
      gold: { ...PLANS.gold },
      black: { ...PLANS.black },
    })
    setMultipliers({ ...POINTS_MULTIPLIER })
    setRules([...POINTS_CONFIG.redemptionRules])
    setHasChanges(false)
    toast.success('Configurações restauradas')
  }

  const planIcons = {
    silver: <Star className="h-5 w-5" />,
    gold: <Crown className="h-5 w-5" />,
    black: <Sparkles className="h-5 w-5" />,
  }

  const planColors = {
    silver: 'from-slate-400 to-slate-600',
    gold: 'from-yellow-400 to-yellow-600',
    black: 'from-violet-600 to-purple-800',
  }

  return (
    <div className="space-y-6">
      {/* Warning Banner */}
      <Card className="border-yellow-500/50 bg-yellow-500/10">
        <CardContent className="p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
          <p className="text-sm text-yellow-700 dark:text-yellow-300">
            <strong>Nota:</strong> As configurações são atualmente definidas no código.
            Em breve será possível editá-las dinamicamente pelo painel.
          </p>
        </CardContent>
      </Card>

      {/* Plans Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Configuração de Planos</CardTitle>
          <CardDescription>Defina preços, descontos e benefícios de cada plano</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-6">
            {(['silver', 'gold', 'black'] as const).map((planKey) => (
              <div
                key={planKey}
                className={`rounded-xl bg-gradient-to-br ${planColors[planKey]} p-[1px]`}
              >
                <div className="bg-card rounded-xl p-4 space-y-4">
                  <div className="flex items-center gap-2 text-foreground">
                    {planIcons[planKey]}
                    <span className="font-bold capitalize">{plans[planKey].name}</span>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">Preço Mensal (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={plans[planKey].priceMonthly}
                        onChange={(e) => handlePlanChange(planKey, 'priceMonthly', parseFloat(e.target.value))}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs">Preço Anual (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={plans[planKey].priceAnnual}
                        onChange={(e) => handlePlanChange(planKey, 'priceAnnual', parseFloat(e.target.value))}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs">Desconto Produtos (%)</Label>
                      <Input
                        type="number"
                        value={plans[planKey].discountProducts}
                        onChange={(e) => handlePlanChange(planKey, 'discountProducts', parseInt(e.target.value))}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs">Desconto Serviços (%)</Label>
                      <Input
                        type="number"
                        value={plans[planKey].discountServices}
                        onChange={(e) => handlePlanChange(planKey, 'discountServices', parseInt(e.target.value))}
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

      {/* Points Multipliers */}
      <Card>
        <CardHeader>
          <CardTitle>Multiplicadores de Pontos</CardTitle>
          <CardDescription>Define quantos pontos cada plano ganha por real gasto</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            {(['silver', 'gold', 'black'] as const).map((planKey) => (
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
                    value={multipliers[planKey]}
                    onChange={(e) => handleMultiplierChange(planKey, parseFloat(e.target.value))}
                    className="w-24"
                  />
                </div>
                <span className="text-sm text-muted-foreground">pts/R$</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Redemption Rules */}
      <Card>
        <CardHeader>
          <CardTitle>Regras de Resgate</CardTitle>
          <CardDescription>Configure as opções de resgate de pontos</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {rules.map((rule, index) => (
              <div key={index} className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                <div className="p-2 rounded-full bg-primary/10">
                  <Gift className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs">Descrição</Label>
                    <Input
                      value={rule.description}
                      onChange={(e) => handleRuleChange(index, 'description', e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Pontos Necessários</Label>
                    <Input
                      type="number"
                      value={rule.points}
                      onChange={(e) => handleRuleChange(index, 'points', parseInt(e.target.value))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Valor (R$)</Label>
                    <Input
                      type="number"
                      value={rule.value}
                      onChange={(e) => handleRuleChange(index, 'value', parseInt(e.target.value))}
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={handleReset} disabled={!hasChanges}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Restaurar
        </Button>
        <Button onClick={handleSave} disabled={!hasChanges}>
          <Save className="h-4 w-4 mr-2" />
          Salvar Configurações
        </Button>
      </div>
    </div>
  )
}
