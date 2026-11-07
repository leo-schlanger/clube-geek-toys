import type { ComponentType, ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'

/** Card shell shared by the member panel blocks: h2 with a pink icon, p-4. */
export function MemberSection({
  icon: Icon,
  title,
  action,
  children,
  className,
}: {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-xl border border-border bg-card p-4 text-card-foreground', className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
          <Icon className="h-5 w-5 text-primary" aria-hidden />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** One-line dashed box for an empty block. No Nono here (one per screen). */
export function SectionEmpty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
      <p>{children}</p>
      {action}
    </div>
  )
}

export function SectionError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
      <span>Não deu para carregar agora.</span>
      <Button type="button" variant="ghost" className="h-11" onClick={onRetry}>
        <RefreshCw className="h-4 w-4" />
        Tentar de novo
      </Button>
    </div>
  )
}
