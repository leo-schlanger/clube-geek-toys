/**
 * Skip Link - Componente de acessibilidade
 *
 * Permite que usuários de teclado pulem diretamente para o conteúdo principal,
 * evitando ter que navegar por todos os elementos do header/menu.
 *
 * Uso:
 * 1. Adicione <SkipLink /> no início do App
 * 2. Adicione id="main-content" no elemento principal da página
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
