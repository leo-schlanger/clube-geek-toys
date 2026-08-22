import { useState, useEffect } from 'react'
import { getWholesaleSalesOpen } from '../../lib/wholesale'

// A flag muda uma vez por semestre: uma requisição por carregamento de página basta, e as três
// telas do canal (home, produto, checkout) compartilham a mesma promessa.
let cached: Promise<boolean> | null = null

function fetchSalesOpen(): Promise<boolean> {
  if (!cached) {
    cached = getWholesaleSalesOpen().catch(() => false)
  }
  return cached
}

/** Limpa o cache do módulo (testes; e após o admin virar a chave). */
export function resetWholesaleSalesOpenCache(): void {
  cached = null
}

export interface WholesaleSalesState {
  /** Canal aceitando pedidos. Falso enquanto carrega — nunca mostre "Comprar" no escuro. */
  salesOpen: boolean
  loading: boolean
}

/**
 * Reads the wholesale channel switch (`wholesale.sales_open`). While it is off the storefront
 * keeps the catalogue and the CNPJ signup visible, but no wholesale cart or checkout.
 *
 * `enabled` desliga a requisição em telas que servem os dois canais (PDP, checkout): no varejo
 * a resposta não muda nada, e o visitante não paga por ela.
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
