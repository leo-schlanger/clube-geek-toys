/**
 * Skip Link - Componente de acessibilidade
 *
 * Lets keyboard users jump straight to the main content instead of tabbing
 * through the whole header and menu.
 *
 * Uso:
 * 1. Add <SkipLink /> at the top of App
 * 2. Add id="main-content" to the page's main element
 */

interface SkipLinkProps {
  targetId?: string
  label?: string
}

export function SkipLink({
  targetId = 'main-content',
  label = 'Pular para o conteúdo principal'
}: SkipLinkProps) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
    >
      {label}
    </a>
  )
}
