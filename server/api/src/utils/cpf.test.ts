import { describe, it, expect } from 'vitest'
import { isValidCPF } from './cpf.js'

describe('API cpf utils', () => {
  it('accepts valid CPF', () => {
    // 529.982.247-25 is a common valid test CPF
    expect(isValidCPF('52998224725')).toBe(true)
  })

  it('rejects invalid', () => {
    expect(isValidCPF('11111111111')).toBe(false)
    expect(isValidCPF('123')).toBe(false)
    expect(isValidCPF('52998224700')).toBe(false)
  })
})
