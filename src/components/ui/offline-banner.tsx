/**
 * OfflineBanner - Exibe aviso quando o usuário está offline
 *
 * Mostra uma barra no topo da página indicando que não há conexão.
 * Automaticamente desaparece quando a conexão é restaurada.
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
      className={`fixed top-0 left-0 right-0 z-[9999] px-4 py-2 text-center text-sm font-medium transition-colors ${
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
