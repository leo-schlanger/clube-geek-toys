import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BillingAddressFields } from './BillingAddressFields'
import { emptyBillingAddress, billingAddressProblem, type BillingAddressInput } from '../lib/billing-address'

const lookupCep = vi.fn()
vi.mock('../lib/shipping', async (orig) => ({
  ...(await orig<typeof import('../lib/shipping')>()),
  lookupCep: (...args: unknown[]) => lookupCep(...args),
}))

const FOUND = {
  cep: '20040020',
  street: 'Avenida Rio Branco',
  neighborhood: 'Centro',
  city: 'Rio de Janeiro',
  state: 'RJ',
}

const seen: { value: BillingAddressInput } = { value: emptyBillingAddress() }
function Harness({ initial = emptyBillingAddress() }: { initial?: BillingAddressInput }) {
  const [value, setValue] = useState(initial)
  return (
    <BillingAddressFields
      value={value}
      onChange={(next) => {
        seen.value = next
        setValue(next)
      }}
    />
  )
}

describe('BillingAddressFields', () => {
  beforeEach(() => {
    lookupCep.mockReset()
    seen.value = emptyBillingAddress()
  })

  it('fills street, district, city and UF from the CEP', async () => {
    lookupCep.mockResolvedValue(FOUND)
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('CEP'), '20040020')
    await user.tab()
    expect(await screen.findByDisplayValue('Avenida Rio Branco')).toBeInTheDocument()
    expect(seen.value.city).toBe('Rio de Janeiro')
    expect(seen.value.state).toBe('RJ')
  })

  // The number used to vanish: the lookup answered after the member had typed
  // it and wrote back the address captured at blur. The PIX button then said
  // "Informe o número." to someone looking at an empty field they had filled.
  it('keeps what was typed while the CEP lookup was in flight', async () => {
    let resolve!: (v: typeof FOUND) => void
    lookupCep.mockReturnValue(new Promise((r) => { resolve = r }))
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('CEP'), '20040020')
    await user.click(screen.getByLabelText('Número'))
    await user.type(screen.getByLabelText('Número'), '100')
    await user.type(screen.getByLabelText('Complemento'), 'apto 3')
    await act(async () => resolve(FOUND))

    expect(screen.getByLabelText('Número')).toHaveValue('100')
    expect(seen.value.number).toBe('100')
    expect(seen.value.complement).toBe('apto 3')
    expect(seen.value.street).toBe('Avenida Rio Branco')
    expect(billingAddressProblem(seen.value)).toBeNull()
  })

  it('does not overwrite a street typed by hand during the lookup', async () => {
    let resolve!: (v: typeof FOUND) => void
    lookupCep.mockReturnValue(new Promise((r) => { resolve = r }))
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('CEP'), '20040020')
    await user.type(screen.getByLabelText('Rua'), 'Rua do Ouvidor')
    await act(async () => resolve(FOUND))
    expect(seen.value.street).toBe('Rua do Ouvidor')
    expect(seen.value.city).toBe('Rio de Janeiro')
  })

  it('ignores a lookup for a CEP the member already changed', async () => {
    let resolve!: (v: typeof FOUND) => void
    lookupCep.mockReturnValue(new Promise((r) => { resolve = r }))
    const user = userEvent.setup()
    render(<Harness />)
    const cep = screen.getByLabelText('CEP')
    await user.type(cep, '20040020')
    await user.tab()
    await user.clear(cep)
    await user.type(cep, '01310')
    await act(async () => resolve(FOUND))
    expect(seen.value.street).toBe('')
    expect(seen.value.city).toBe('')
  })

  it('keeps everything typed when the lookup fails', async () => {
    lookupCep.mockRejectedValue(new Error('CEP não encontrado'))
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('CEP'), '20040020')
    await user.type(screen.getByLabelText('Número'), '7')
    expect(seen.value.number).toBe('7')
    expect(seen.value.cep).toBe('20040-020')
  })
})
