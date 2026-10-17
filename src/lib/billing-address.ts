import { maskCep } from './shipping'

/** Same 27 units as `BRAZILIAN_UFS` on the server. Each copy has its own test. */
export const BRAZILIAN_UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const

const ufSet: ReadonlySet<string> = new Set(BRAZILIAN_UFS)

/** What the form holds. Empty strings mean "not filled yet". */
export interface BillingAddressInput {
  cep: string
  street: string
  number: string
  complement: string
  neighborhood: string
  city: string
  state: string
}

/** What the club payment routes accept. */
export interface BillingAddressBody {
  cep: string
  street: string
  number: string
  complement?: string
  neighborhood: string
  city: string
  state: string
}

export function emptyBillingAddress(): BillingAddressInput {
  return {
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
  }
}

/** Prefill from `members.billing_address`. Missing fields stay blank. */
export function billingAddressFromStored(
  value?: Partial<BillingAddressInput> | null,
): BillingAddressInput {
  const base = emptyBillingAddress()
  if (!value) return base
  return {
    cep: value.cep ? maskCep(value.cep) : '',
    street: value.street ?? '',
    number: value.number ?? '',
    complement: value.complement ?? '',
    neighborhood: value.neighborhood ?? '',
    city: value.city ?? '',
    state: (value.state ?? '').toUpperCase(),
  }
}

/** First problem, in the order the form is filled. Null means it can be sent. */
export function billingAddressProblem(address: BillingAddressInput): string | null {
  if (address.cep.replace(/\D/g, '').length !== 8) return 'Informe o CEP.'
  if (!address.street.trim()) return 'Informe a rua.'
  if (!address.number.trim()) return 'Informe o número.'
  if (!address.neighborhood.trim()) return 'Informe o bairro.'
  if (!address.city.trim()) return 'Informe a cidade.'
  if (!ufSet.has(address.state.trim().toUpperCase())) return 'Informe a UF.'
  return null
}

export function toBillingAddressBody(address: BillingAddressInput): BillingAddressBody {
  const complement = address.complement.trim()
  return {
    cep: address.cep.replace(/\D/g, ''),
    street: address.street.trim(),
    number: address.number.trim(),
    ...(complement ? { complement } : {}),
    neighborhood: address.neighborhood.trim(),
    city: address.city.trim(),
    state: address.state.trim().toUpperCase(),
  }
}
