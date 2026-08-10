import { describe, it, expect } from 'vitest'
import { normalizeCnpj, maskCnpj, formatCnpj, isValidCnpj } from './cnpj'

const VALID = '11222333000181'
const VALID_FMT = '11.222.333/0001-81'

describe('normalizeCnpj', () => {
  it('strips non-digits', () => {
    expect(normalizeCnpj(VALID_FMT)).toBe(VALID)
  })
  it('handles empty', () => {
    expect(normalizeCnpj('')).toBe('')
    expect(normalizeCnpj(null as unknown as string)).toBe('')
  })
})

describe('maskCnpj / formatCnpj', () => {
  it('formats progressive input', () => {
    expect(maskCnpj('11')).toBe('11')
    expect(maskCnpj('11222')).toBe('11.222')
    expect(maskCnpj('11222333')).toBe('11.222.333')
    expect(maskCnpj('112223330001')).toBe('11.222.333/0001')
    expect(maskCnpj(VALID)).toBe(VALID_FMT)
  })
  it('caps at 14 digits', () => {
    expect(normalizeCnpj(maskCnpj(VALID + '999'))).toHaveLength(14)
  })
  it('formatCnpj aliases mask for full cnpj', () => {
    expect(formatCnpj(VALID)).toBe(VALID_FMT)
  })
  it('formatCnpj masks partial input (same as maskCnpj)', () => {
    expect(formatCnpj('123')).toBe('12.3')
  })

})

describe('isValidCnpj', () => {
  it('accepts known valid CNPJs', () => {
    expect(isValidCnpj(VALID)).toBe(true)
    expect(isValidCnpj(VALID_FMT)).toBe(true)
    expect(isValidCnpj('04.252.011/0001-10')).toBe(true)
    expect(isValidCnpj('00000000000191')).toBe(true)
  })
  it('rejects invalid length', () => {
    expect(isValidCnpj('123')).toBe(false)
    expect(isValidCnpj('1122233300018')).toBe(false)
  })
  it('rejects all same digit', () => {
    expect(isValidCnpj('11111111111111')).toBe(false)
  })
  it('rejects wrong check digits', () => {
    expect(isValidCnpj('11222333000100')).toBe(false)
  })
})
