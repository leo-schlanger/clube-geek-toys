import { cn } from '../lib/utils'

/**
 * Discreet "built by" line for page footers.
 *
 * Placement convention, applied everywhere this appears: always the **last**
 * line of the footer, one step smaller and more muted than the brand's own
 * copyright. The credit belongs to the builder, so it must never compete with
 * the store's name, contact details or legal notices for attention.
 */
export function CreatorCredit({ className }: { className?: string }) {
  return (
    <p className={cn('text-[11px] text-muted-foreground/60', className)}>
      Desenvolvido por{' '}
      <a
        href="https://leoschlanger.com"
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 transition-colors hover:text-foreground"
      >
        Leo Schlanger
      </a>
    </p>
  )
}
