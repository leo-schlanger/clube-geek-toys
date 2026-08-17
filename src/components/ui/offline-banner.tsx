/**
 * Offline notice.
 *
 * **Sits at the bottom, not the top.** It used to be `fixed top-0 z-[9999]`,
 * and all three SPAs put their header at `top: 0`. With the page scrolled, this
 * 39px strip covered the header's first row and blocked cart, login, search and
 * theme for as long as the connection was down.
 *
 * At the bottom it competes with no navigation. Its z sits **below**
 * `CookieConsent` (also `bottom-0`): if both appear, consent wins, being a
 * one-off blocking decision. `RadioMiniPlayer` lives at `bottom-20`, clear of
 * this strip.
 */

import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { WifiOff, Wifi } from 'lucide-react'
import { useEffect, useState } from 'react'

export function OfflineBanner() {
  const { isOnline, wasOffline } = useOnlineStatus()
  const [showReconnected, setShowReconnected] = useState(false)

  // Show the reconnected message for 3s
  useEffect(() => {
    if (isOnline && wasOffline) {
      queueMicrotask(() => setShowReconnected(true))
      const timer = setTimeout(() => {
        setShowReconnected(false)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [isOnline, wasOffline])

  // Nothing to show when online and not recently reconnected
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
