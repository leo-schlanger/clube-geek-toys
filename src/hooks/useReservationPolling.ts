import { useEffect, useRef } from 'react'
import { getPublicReservation, type PublicReservation } from '../lib/event-tickets'

/**
 * 6 s keeps one buyer at 10 lookups a minute — under the 15/min the public
 * lookup allows per IP, with room for a reload.
 */
export const RESERVATION_POLL_INTERVAL_MS = 6000
/** The code lives 24 h, but nobody watches a QR for longer than this. */
export const RESERVATION_POLL_TIMEOUT_MS = 30 * 60 * 1000

/**
 * Watches a pending Pagar.me reservation until the PIX lands.
 *
 * Each lookup also makes the API ask Pagar.me and settle a paid charge, so the
 * page flips to "ingressos liberados" seconds after the bank app says paid —
 * even when the webhook was lost. Stops on any status other than `pending`.
 */
export function useReservationPolling(
  code: string | null | undefined,
  active: boolean,
  onUpdate: (reservation: PublicReservation) => void
): void {
  const onUpdateRef = useRef(onUpdate)
  useEffect(() => {
    onUpdateRef.current = onUpdate
  }, [onUpdate])

  useEffect(() => {
    if (!code || !active) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const startedAt = Date.now()

    async function tick() {
      try {
        const found = await getPublicReservation(code as string)
        if (stopped) return
        if (found) {
          onUpdateRef.current(found)
          if (found.status !== 'pending' || found.pixExpired) return
        }
      } catch {
        // Transient: try again on the next tick.
      }
      if (stopped || Date.now() - startedAt > RESERVATION_POLL_TIMEOUT_MS) return
      timer = setTimeout(tick, RESERVATION_POLL_INTERVAL_MS)
    }

    timer = setTimeout(tick, RESERVATION_POLL_INTERVAL_MS)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [code, active])
}
