import { useState, useEffect } from 'react'
import { getWholesaleSalesOpen } from '../../lib/wholesale'

// The flag changes about once a semester: one request per page load is enough, and the three
// channel screens (home, product, checkout) share the same promise.
let cached: Promise<boolean> | null = null

function fetchSalesOpen(): Promise<boolean> {
  if (!cached) {
    cached = getWholesaleSalesOpen().catch(() => false)
  }
  return cached
}

/** Clear the module cache (tests; and after admin flips the switch). */
export function resetWholesaleSalesOpenCache(): void {
  cached = null
}

export interface WholesaleSalesState {
  /** Channel accepting orders. False while loading — never show "Comprar" in the dark. */
  salesOpen: boolean
  loading: boolean
}

/**
 * Reads the wholesale channel switch (`wholesale.sales_open`). While it is off the storefront
 * keeps the catalogue and the CNPJ signup visible, but no wholesale cart or checkout.
 *
 * `enabled` skips the request on screens that serve both channels (PDP, checkout): on retail
 * the response changes nothing, and the visitor should not pay for it.
 */
export function useWholesaleSalesOpen(enabled = true): WholesaleSalesState {
  const [salesOpen, setSalesOpen] = useState(false)
  const [loading, setLoading] = useState(enabled)

  useEffect(() => {
    if (!enabled) return
    let active = true
    fetchSalesOpen()
      .then((open) => {
        if (active) setSalesOpen(open)
      })
      .catch(() => {
        if (active) setSalesOpen(false)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [enabled])

  return { salesOpen, loading }
}
