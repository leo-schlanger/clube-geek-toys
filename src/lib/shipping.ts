import { api } from './api-client'

export interface ViaCepResult {
  cep: string
  street: string
  neighborhood: string
  city: string
  state: string
}

export interface ShippingOption {
  id: string
  name: string
  company: string
  price: number
  days: number
  service: string
}

export interface ShippingQuoteResult {
  quoteToken: string
  expiresAt: string
  options: ShippingOption[]
  package: { weightG: number; heightCm: number; widthCm: number; lengthCm: number }
  source: 'melhor_envio' | 'fallback'
}

export async function lookupCep(cep: string): Promise<ViaCepResult> {
  const cleaned = cep.replace(/\D/g, '')
  const result = await api.get<ViaCepResult>(`/shipping/cep/${cleaned}`, { skipAuth: true })
  if (result.error || !result.data) {
    throw new Error(result.error || 'CEP não encontrado.')
  }
  return result.data
}

export async function quoteShipping(
  cep: string,
  items: { productId: string; quantity: number }[]
): Promise<ShippingQuoteResult> {
  const result = await api.post<ShippingQuoteResult>(
    '/shipping/quote',
    { cep, items },
    { skipAuth: true }
  )
  if (result.error || !result.data) {
    throw new Error(result.error || 'Não foi possível calcular o frete.')
  }
  return result.data
}

/**
 * Physical store where pickup orders are collected. Mirrors
 * `STORE_PICKUP_LOCATION` on the backend — display only; the server always
 * writes the address onto the order.
 */
export const STORE_PICKUP = {
  name: 'GeekPop & Toys',
  address: 'Rua Barata Ribeiro, 181, Loja J — Copacabana, Rio de Janeiro/RJ',
  cep: '22011-001',
  hours: 'Segunda a sábado, 10h às 19h',
  mapsUrl:
    'https://maps.google.com/?q=Rua+Barata+Ribeiro,+181,+Loja+J,+Copacabana,+Rio+de+Janeiro',
} as const

export const PICKUP_SERVICE_LABEL = 'Retirada na loja'

export function maskCep(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 5) return d
  return `${d.slice(0, 5)}-${d.slice(5)}`
}
