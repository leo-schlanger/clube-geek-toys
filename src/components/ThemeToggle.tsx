import { Moon, Sun, Monitor } from 'lucide-react'
import { Button } from './ui/button'
import { useTheme, type ThemePreference } from '../contexts/ThemeContext'
import { cn } from '../lib/utils'

type Props = {
  /** compact = só ícone; full = 3 opções light/dark/system */
  variant?: 'icon' | 'segmented'
  className?: string
}

/**
 * Controle de tema light / dark / system.
 * Preferência em localStorage (`geekpop-theme`).
 */
export function ThemeToggle({ variant = 'icon', className }: Props) {
  const { theme, resolved, setTheme, toggle } = useTheme()

  if (variant === 'icon') {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={toggle}
        className={className}
        title={resolved === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
        aria-label={resolved === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
      >
        {resolved === 'dark' ? (
          <Sun className="h-5 w-5" />
        ) : (
          <Moon className="h-5 w-5" />
        )}
      </Button>
    )
  }

  const options: { id: ThemePreference; label: string; icon: React.ElementType }[] = [
    { id: 'light', label: 'Claro', icon: Sun },
    { id: 'dark', label: 'Escuro', icon: Moon },
    { id: 'system', label: 'Sistema', icon: Monitor },
  ]

  return (
    <div
      role="group"
      aria-label="Tema da interface"
      className={cn(
        'grid w-full grid-cols-3 gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5',
        className
      )}
    >
      {options.map(({ id, label, icon: Icon }) => {
        const active = theme === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => setTheme(id)}
            className={cn(
              'inline-flex min-w-0 items-center justify-center gap-1 rounded-md px-1.5 py-2 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
            aria-pressed={active}
            title={label}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate leading-none">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
