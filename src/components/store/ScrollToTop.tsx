import { useEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Scrolls to the top on route change.
 *
 * Without it, opening a product from mid-catalogue kept the previous scroll and
 * the page appeared already cut in half. Back navigation (POP) is the
 * exception: there the expectation is landing where you were, and the browser
 * restores that itself.
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
