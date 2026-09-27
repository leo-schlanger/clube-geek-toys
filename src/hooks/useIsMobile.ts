import { useSyncExternalStore } from 'react'

/** Tailwind's `sm` breakpoint: below it, admin tables become cards. */
export const MOBILE_QUERY = '(max-width: 639px)'

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener?.('change', onChange)
  return () => mql.removeEventListener?.('change', onChange)
}

function getSnapshot(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.(MOBILE_QUERY).matches
}

/**
 * True on a phone-sized screen.
 *
 * Renders one layout instead of hiding the other with CSS: two copies of every
 * row meant duplicate checkboxes and inputs bound to the same state, and a
 * screen reader reading the list twice.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
