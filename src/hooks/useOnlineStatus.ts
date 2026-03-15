/**
 * useOnlineStatus - Hook para detectar status de conexão
 *
 * Usa a API navigator.onLine e eventos online/offline do navegador.
 *
 * Limitações:
 * - navigator.onLine pode ter falsos positivos (conectado ao wifi mas sem internet)
 * - Para verificação mais precisa, seria necessário fazer ping a um servidor
 */

import { useState, useEffect, useCallback } from 'react'

interface UseOnlineStatusReturn {
  isOnline: boolean
  wasOffline: boolean // True se ficou offline em algum momento da sessão
}

export function useOnlineStatus(): UseOnlineStatusReturn {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [wasOffline, setWasOffline] = useState(false)

  const handleOnline = useCallback(() => {
    setIsOnline(true)
  }, [])

  const handleOffline = useCallback(() => {
    setIsOnline(false)
    setWasOffline(true)
  }, [])

  useEffect(() => {
    // Adicionar listeners para mudanças de status
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [handleOnline, handleOffline])

  return { isOnline, wasOffline }
}
