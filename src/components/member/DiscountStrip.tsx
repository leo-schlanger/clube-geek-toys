import { CLUB_PLAN } from '../../types'
import { Percent, ShoppingBag } from 'lucide-react'

export function DiscountStrip() {
  return (
    <div className="rounded-xl bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-500/20 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Percent className="h-4 w-4 text-green-400" />
        <span className="text-xs font-semibold text-green-300 uppercase tracking-wider">
          Seu desconto de membro
        </span>
      </div>
      <div className="text-center">
        <p className="text-4xl font-bold text-green-400">{CLUB_PLAN.discount}%</p>
        <p className="text-xs text-green-300/70 mt-1">em qualquer produto</p>
      </div>
      <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <ShoppingBag className="h-3 w-3 text-primary" />
        <span>Válido na loja física e na loja online</span>
      </div>
    </div>
  )
}
