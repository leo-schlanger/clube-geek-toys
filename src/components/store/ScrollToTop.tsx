import { useEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Leva a janela ao topo quando a rota muda.
 *
 * Sem isso, abrir um produto a partir do meio da vitrine mantinha a rolagem
 * anterior e a página aparecia já cortada no meio. Voltar (POP) é exceção: ali
 * o esperado é cair de novo onde a pessoa estava na listagem, e o navegador
 * restaura isso sozinho.
 */
export function ScrollToTop() {
  const { pathname } = useLocation()
  const navigationType = useNavigationType()

  useEffect(() => {
    if (navigationType === 'POP') return
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname, navigationType])

  return null
}
