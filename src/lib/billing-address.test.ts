import { describe, it, expect } from 'vitest'
import {
  billingAddressProblem,
  billingAddressFromStored,
  toBillingAddressBody,
} from './billing-address'

const filled = {
  cep: '22011-001',
  street: 'Rua Barata Ribeiro',
  number: '181',
  complement: 'Loja J',
  neighborhood: 'Copacabana',
  city: 'Rio de Janeiro',
  state: 'RJ',
}

describe('billing address', () => {
  it('aceita RJ e recusa XX', () => {
    expect(billingAddressProblem(filled)).toBeNull()
    expect(billingAddressProblem({ ...filled, state: 'XX' })).toBe('Informe a UF.')
    expect(billingAddressProblem({ ...filled, cep: '220' })).toBe('Informe o CEP.')
  })

  it('manda CEP só com dígitos e omite complemento vazio', () => {
    expect(toBillingAddressBody({ ...filled, complement: '  ', state: 'rj' })).toEqual({
      cep: '22011001',
      street: 'Rua Barata Ribeiro',
      number: '181',
      neighborhood: 'Copacabana',
      city: 'Rio de Janeiro',
      state: 'RJ',
    })
  })

  it('mascara o CEP guardado e não inventa rua', () => {
    expect(billingAddressFromStored({ cep: '22011001', state: 'rj' })).toMatchObject({
      cep: '22011-001',
      street: '',
      state: 'RJ',
    })
    expect(billingAddressFromStored(null).number).toBe('')
  })
})
