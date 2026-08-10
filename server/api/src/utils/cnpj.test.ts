import { describe, it, expect } from 'vitest'
import { normalizeCnpj, formatCnpj, isValidCnpj } from './cnpj.js'

describe('API cnpj utils', () => {
  it('normalize and format', () => {
    expect(normalizeCnpj('11.222.333/0001-81')).toBe('11222333000181')
    expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81')
    expect(formatCnpj('123')).toBe('123')
  })

  it('validates checksum', () => {
    expect(isValidCnpj('11222333000181')).toBe(true)
    expect(isValidCnpj('00000000000191')).toBe(true)
    expect(isValidCnpj('11111111111111')).toBe(false)
    expect(isValidCnpj('11222333000100')).toBe(false)
  })
})
