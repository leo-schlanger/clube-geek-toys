import { useEffect } from 'react'

/**
 * Avisa antes de sair da página com um PIX gerado e não pago.
 *
 * O texto do diálogo é do navegador e não pode ser customizado. Para uma
 * pergunta nossa, intercepte o fechamento com `useConfirm`; isto cobre o X da
 * aba e o voltar do celular.
 */
export function usePixExitGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
      return ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [active])
}
