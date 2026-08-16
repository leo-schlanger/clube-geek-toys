/**
 * OfflineBanner — aviso de conexão caída.
 *
 * **Fica no rodapé, não no topo.** Até 16/08/2026 era `fixed top-0 z-[9999]`,
 * e as três SPAs têm cabeçalho em `top: 0` (loja e membro por `sticky`, admin
 * por `fixed`). Com a página rolada, esta faixa de 39px cobria a primeira
 * linha do cabeçalho e **bloqueava carrinho, login, busca e tema** enquanto a
 * conexão estivesse caída — medido com `elementFromPoint` a 390px e 1440px.
 *
 * No rodapé não disputa espaço com navegação nenhuma. O z fica **abaixo** do
 * `CookieConsent` (z-[9998], também `bottom-0`): se os dois aparecerem juntos,
 * o consentimento vence, porque é decisão bloqueante de uma vez só. O
 * `RadioMiniPlayer` mora em `bottom-20`, acima desta faixa, sem colidir.
 */

import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { WifiOff, Wifi } from 'lucide-react'
import { useEffect, useState } from 'react'

export function OfflineBanner() {
  const { isOnline, wasOffline } = useOnlineStatus()
  const [showReconnected, setShowReconnected] = useState(false)

  // Mostrar mensagem de reconexão por 3 segundos
  useEffect(() => {
    if (isOnline && wasOffline) {
      queueMicrotask(() => setShowReconnected(true))
      const timer = setTimeout(() => {
        setShowReconnected(false)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [isOnline, wasOffline])

  // Não mostrar nada se online e não foi reconectado recentemente
  if (isOnline && !showReconnected) {
    return null
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`fixed bottom-0 left-0 right-0 z-[9997] px-4 py-2 text-center text-sm font-medium transition-colors ${
        isOnline
          ? 'bg-green-500 text-white'
          : 'bg-yellow-500 text-yellow-900'
      }`}
    >
      {isOnline ? (
        <span className="inline-flex items-center gap-2">
          <Wifi className="h-4 w-4" aria-hidden="true" />
          Conexão restaurada
        </span>
      ) : (
        <span className="inline-flex items-center gap-2">
          <WifiOff className="h-4 w-4" aria-hidden="true" />
          Você está offline. Verifique sua conexão.
        </span>
      )}
    </div>
  )
}
