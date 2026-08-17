/**
 * Connection status from navigator.onLine plus the online/offline events.
 *
 * Known limit: navigator.onLine reports true for a wifi connection with no
 * internet behind it. Detecting that would require pinging a server.
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

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [handleOnline, handleOffline])

  return { isOnline, wasOffline }
}
