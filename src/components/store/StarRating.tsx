import { Star } from 'lucide-react'
import { cn } from '../../lib/utils'

interface StarRatingProps {
  value: number
  onChange?: (n: number) => void
  size?: 'sm' | 'md'
  className?: string
  /** Show numeric average next to stars */
  showValue?: boolean
  count?: number
}

export function StarRating({
  value,
  onChange,
  size = 'md',
  className,
  showValue,
  count,
}: StarRatingProps) {
  const interactive = typeof onChange === 'function'
  const dim = size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5'

  return (
    <div className={cn('inline-flex items-center gap-1', className)}>
      <div className="flex items-center gap-0.5" role={interactive ? 'radiogroup' : 'img'} aria-label={`${value} de 5 estrelas`}>
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = n <= Math.round(value)
          if (interactive) {
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={n === value}
                aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
                className="rounded p-0.5 text-muted-foreground transition-colors hover:text-accent"
                onClick={() => onChange?.(n)}
              >
                <Star
                  className={cn(dim, filled && 'fill-accent text-accent')}
                />
              </button>
            )
          }
          return (
            <Star
              key={n}
              className={cn(dim, filled ? 'fill-accent text-accent' : 'text-muted-foreground/40')}
            />
          )
        })}
      </div>
      {showValue && value > 0 && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {value.toFixed(1)}
          {typeof count === 'number' ? ` (${count})` : ''}
        </span>
      )}
    </div>
  )
}
