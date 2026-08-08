import { cn } from '../../lib/utils'

interface PaymentTrustBadgesProps {
  className?: string
  compact?: boolean
}

/**
 * Trust strip: payment methods + Correios shipping — standard on BR e-commerce.
 */
export function PaymentTrustBadges({ className, compact = false }: PaymentTrustBadgesProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {!compact && (
        <p className="text-xs font-medium text-muted-foreground">Formas de pagamento</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Badge>PIX</Badge>
        <Badge>Visa</Badge>
        <Badge>Mastercard</Badge>
        <Badge>Elo</Badge>
        <Badge subtle>Stripe</Badge>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Pagamento seguro · Envio pelos Correios para todo o Brasil
      </p>
    </div>
  )
}

function Badge({
  children,
  subtle,
}: {
  children: React.ReactNode
  subtle?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide',
        subtle
          ? 'border-border bg-muted/50 text-muted-foreground'
          : 'border-primary/25 bg-primary/10 text-primary'
      )}
    >
      {children}
    </span>
  )
}
