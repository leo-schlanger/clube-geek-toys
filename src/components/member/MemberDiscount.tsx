import { Percent, ShoppingBag } from 'lucide-react'
import { Button } from '../ui/button'
import { MemberSection } from './MemberSection'
import { MEMBER_DISCOUNT_PERCENT } from '../../types'
import { getShopUrl } from '../../lib/subdomain'
import { cn } from '../../lib/utils'

/** The member's shop discount; struck through while the membership is expired. */
export function MemberDiscount({ paused = false }: { paused?: boolean }) {
  return (
    <MemberSection icon={Percent} title="Seu desconto de membro">
      <div className="flex items-center gap-4">
        <p
          className={cn(
            'font-heading text-5xl font-extrabold tabular-nums',
            paused ? 'text-muted-foreground line-through' : 'text-primary'
          )}
        >
          {MEMBER_DISCOUNT_PERCENT}%
        </p>
        <div className="min-w-0">
          <p className="font-semibold">{paused ? 'Pausado até renovar' : 'em qualquer produto'}</p>
          <p className="text-sm text-muted-foreground">
            Na loja física e na online. Entrou logada, o preço de membro aparece sozinho.
          </p>
        </div>
      </div>
      <Button asChild variant="outline" className="mt-4 h-11 w-full">
        <a href={getShopUrl()}>
          <ShoppingBag className="h-4 w-4" />
          Ir para a loja
        </a>
      </Button>
    </MemberSection>
  )
}
