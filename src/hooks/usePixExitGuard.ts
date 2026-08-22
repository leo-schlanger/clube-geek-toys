import { useEffect } from 'react'

/**
 * Warn before leaving a page with an unpaid generated PIX.
 *
 * The dialog copy is the browser's and cannot be customised. For an in-app
 * prompt, intercept close with `useConfirm`; this covers the tab X and
 * mobile back.
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
