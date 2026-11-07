import { AlertTriangle, RefreshCw, XCircle } from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'

/** Renewal warning above the card: amber when it is close, red once expired. */
export function RenewNotice({
  tone,
  title,
  text,
  onRenew,
}: {
  tone: 'warning' | 'destructive'
  title: string
  text: string
  onRenew: () => void
}) {
  const Icon = tone === 'destructive' ? XCircle : AlertTriangle
  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-xl border p-4 sm:flex-nowrap',
        tone === 'destructive' ? 'border-destructive/40 bg-destructive/10' : 'border-warning/50 bg-warning/10'
      )}
    >
      <Icon
        className={cn('h-5 w-5 shrink-0 self-start', tone === 'destructive' ? 'text-destructive' : 'text-amber-700 dark:text-warning')}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
      <Button
        onClick={onRenew}
        variant={tone === 'destructive' ? 'default' : 'warning'}
        className="h-12 w-full text-[19px] font-bold sm:w-auto sm:px-6"
      >
        <RefreshCw className="h-5 w-5" />
        Renovar
      </Button>
    </div>
  )
}
