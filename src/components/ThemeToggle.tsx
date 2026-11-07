import { Moon, Sun, Monitor } from 'lucide-react'
import { Button } from './ui/button'
import { useTheme, type ThemePreference } from '../contexts/ThemeContext'
import { cn } from '../lib/utils'

type Props = {
  /** icon = one button cycling the three modes; segmented = all three side by side. */
  variant?: 'icon' | 'segmented'
  className?: string
}

const OPTIONS: { id: ThemePreference; label: string; icon: React.ElementType }[] = [
  { id: 'light', label: 'Claro', icon: Sun },
  { id: 'dark', label: 'Escuro', icon: Moon },
  { id: 'system', label: 'Sistema', icon: Monitor },
]

/**
 * Light / dark / system theme control.
 * Preference stored in localStorage (`geekpop-theme`); default is system.
 */
export function ThemeToggle({ variant = 'icon', className }: Props) {
  const { theme, setTheme } = useTheme()

  if (variant === 'icon') {
    // One button cycling light → dark → system, like the home site's compact toggle
    const current = OPTIONS.find((o) => o.id === theme) ?? OPTIONS[2]
    const next = OPTIONS[(OPTIONS.indexOf(current) + 1) % OPTIONS.length]
    const Icon = current.icon
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setTheme(next.id)}
        className={cn('h-11 w-11', className)}
        title={`Tema: ${current.label}`}
        aria-label={`Tema: ${current.label}. Mudar para ${next.label}`}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </Button>
    )
  }

  return (
    <div
      role="group"
      aria-label="Tema da interface"
      className={cn(
        // Three equal columns, full labels stacked under the icon to fit the sidebar
        'grid w-full grid-cols-3 gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5',
        className
      )}
    >
      {OPTIONS.map(({ id, label, icon: Icon }) => {
        const active = theme === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => setTheme(id)}
            className={cn(
              'inline-flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1.5 transition-colors',
              'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
            aria-pressed={active}
            title={label}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="max-w-full text-[10px] font-medium leading-none whitespace-nowrap">
              {label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
