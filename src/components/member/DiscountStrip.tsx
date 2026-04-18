import { PLANS, POINTS_MULTIPLIER, type PlanType } from '../../types'
import { Percent, Zap } from 'lucide-react'

interface DiscountStripProps {
  plan: PlanType
}

export function DiscountStrip({ plan }: DiscountStripProps) {
  const planData = PLANS[plan]
  const multiplier = POINTS_MULTIPLIER[plan]

  return (
    <div className="rounded-xl bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-500/20 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Percent className="h-4 w-4 text-green-400" />
        <span className="text-xs font-semibold text-green-300 uppercase tracking-wider">
          Seus descontos
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="text-center">
          <p className="text-3xl font-bold text-green-400">{planData.discountProducts}%</p>
          <p className="text-xs text-green-300/70 mt-0.5">em produtos</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold text-green-400">{planData.discountServices}%</p>
          <p className="text-xs text-green-300/70 mt-0.5">em serviços</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Zap className="h-3 w-3 text-primary" />
        <span>Você ganha <strong className="text-primary">{multiplier}x pontos</strong> por real gasto</span>
      </div>
    </div>
  )
}
