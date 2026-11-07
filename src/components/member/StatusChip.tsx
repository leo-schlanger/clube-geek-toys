import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export type ChipTone = 'success' | 'warning' | 'destructive' | 'primary' | 'muted'

// Text stays foreground: coloured text on a light surface fails AA. The tone is
// carried by the dot, the tint and the border.
const TONE: Record<ChipTone, { box: string; dot: string }> = {
  success: { box: 'border-success/35 bg-success/10', dot: 'bg-success' },
  warning: { box: 'border-warning/35 bg-warning/10', dot: 'bg-warning' },
  destructive: { box: 'border-destructive/35 bg-destructive/10', dot: 'bg-destructive' },
  primary: { box: 'border-primary/35 bg-primary/10', dot: 'bg-primary' },
  muted: { box: 'border-border bg-muted', dot: 'bg-muted-foreground' },
}

export function StatusChip({ tone, children, className }: { tone: ChipTone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold text-foreground',
        TONE[tone].box,
        className
      )}
    >
      <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', TONE[tone].dot)} />
      {children}
    </span>
  )
}
