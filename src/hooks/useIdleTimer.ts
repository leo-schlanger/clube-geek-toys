import { useEffect, useRef } from 'react'

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove'] as const

interface UseIdleTimerOptions {
  /** Idle threshold in milliseconds before onIdle fires. */
  timeout: number
  /** Called when the user has been idle for `timeout` ms. */
  onIdle: () => void
  /** Disable the timer (e.g., when user is logged out). */
  disabled?: boolean
}

/**
 * Fires `onIdle` after a period of user inactivity.
 *
 * Tracks DOM activity events. The timer is reset on any interaction.
 * Cleans up listeners and the timer on unmount or when disabled.
 */
export function useIdleTimer({ timeout, onIdle, disabled }: UseIdleTimerOptions): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onIdleRef = useRef(onIdle)

  // Keep the latest onIdle in a ref so the effect doesn't have to re-run on every render.
  useEffect(() => {
    onIdleRef.current = onIdle
  }, [onIdle])

  useEffect(() => {
    if (disabled) return

    function reset() {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => onIdleRef.current(), timeout)
    }

    // Initial scheduling
    reset()

    // Throttle: only reset on a real activity event, but coalesce duplicates per tick.
    let throttled = false
    const handler = () => {
      if (throttled) return
      throttled = true
      requestAnimationFrame(() => {
        throttled = false
      })
      reset()
    }

    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, handler, { passive: true })
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, handler)
      }
    }
  }, [timeout, disabled])
}
