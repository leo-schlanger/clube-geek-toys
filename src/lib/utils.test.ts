import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  cn,
  formatCurrency,
  formatCPF,
  formatPhone,
  validateCPF,
  getStatusColor,
  getStatusLabel,
  getPlanLabel,
  getPlanDiscount,
  calculateDaysUntilExpiry,
  isExpired,
  formatDate,
  generateId,
} from './utils'

describe('cn', () => {
  it('should merge class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('should handle conditional classes', () => {
    const shouldIncludeBar = false
    expect(cn('foo', shouldIncludeBar && 'bar', 'baz')).toBe('foo baz')
  })

  it('should merge tailwind classes', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4')
  })

  it('should handle undefined and null', () => {
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar')
  })
})

describe('formatCurrency', () => {
  it('should format number as BRL currency', () => {
    expect(formatCurrency(1234.56)).toMatch(/R\$\s?1\.234,56/)
  })

  it('should handle zero', () => {
    expect(formatCurrency(0)).toMatch(/R\$\s?0,00/)
  })

  it('should handle negative numbers', () => {
    expect(formatCurrency(-100)).toMatch(/-R\$\s?100,00/)
  })
})

describe('formatCPF', () => {
  it('should format CPF with mask', () => {
    expect(formatCPF('12345678900')).toBe('123.456.789-00')
  })

  it('should handle already formatted CPF', () => {
    expect(formatCPF('123.456.789-00')).toBe('123.456.789-00')
  })
})

describe('formatPhone', () => {
  it('should format 11 digit phone', () => {
    expect(formatPhone('11999998888')).toBe('(11) 99999-8888')
  })

  it('should format 10 digit phone', () => {
    expect(formatPhone('1199998888')).toBe('(11) 9999-8888')
  })

  it('should handle already formatted phone', () => {
    expect(formatPhone('(11) 99999-8888')).toBe('(11) 99999-8888')
  })
})

describe('validateCPF', () => {
  it('should validate correct CPF', () => {
    expect(validateCPF('529.982.247-25')).toBe(true)
    expect(validateCPF('52998224725')).toBe(true)
  })

  it('should reject CPF with wrong length', () => {
    expect(validateCPF('123')).toBe(false)
    expect(validateCPF('123456789001')).toBe(false)
  })

  it('should reject CPF with repeated digits', () => {
    expect(validateCPF('11111111111')).toBe(false)
    expect(validateCPF('00000000000')).toBe(false)
  })

  it('should reject CPF with invalid check digits', () => {
    expect(validateCPF('12345678901')).toBe(false)
    expect(validateCPF('529.982.247-26')).toBe(false)
  })
})

describe('getStatusColor', () => {
  it('should return correct color for each status', () => {
    expect(getStatusColor('active')).toBe('bg-green-500')
    expect(getStatusColor('pending')).toBe('bg-yellow-500')
    expect(getStatusColor('inactive')).toBe('bg-red-500')
    expect(getStatusColor('expired')).toBe('bg-red-500')
  })

  it('should return gray for unknown status', () => {
    expect(getStatusColor('unknown')).toBe('bg-gray-500')
  })
})

describe('getStatusLabel', () => {
  it('should return correct label for each status', () => {
    expect(getStatusLabel('active')).toBe('Ativo')
    expect(getStatusLabel('pending')).toBe('Pendente')
    expect(getStatusLabel('inactive')).toBe('Inativo')
    expect(getStatusLabel('expired')).toBe('Expirado')
  })

  it('should return the status itself for unknown status', () => {
    expect(getStatusLabel('unknown')).toBe('unknown')
  })
})

describe('getPlanLabel', () => {
  it('should return correct label for each plan', () => {
    expect(getPlanLabel('silver')).toBe('Silver')
    expect(getPlanLabel('gold')).toBe('Gold')
    expect(getPlanLabel('black')).toBe('Black')
  })

  it('should return the plan itself for unknown plan', () => {
    expect(getPlanLabel('unknown')).toBe('unknown')
  })
})

describe('getPlanDiscount', () => {
  it('should return correct discount for each plan', () => {
    expect(getPlanDiscount('silver')).toBe(10)
    expect(getPlanDiscount('gold')).toBe(15)
    expect(getPlanDiscount('black')).toBe(20)
  })

  it('should return 0 for unknown plan', () => {
    expect(getPlanDiscount('unknown')).toBe(0)
  })
})

describe('calculateDaysUntilExpiry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should calculate positive days until future date', () => {
    vi.setSystemTime(new Date('2024-01-01'))
    const futureDate = new Date('2024-01-11')
    expect(calculateDaysUntilExpiry(futureDate)).toBe(10)
  })

  it('should calculate negative days for past date', () => {
    vi.setSystemTime(new Date('2024-01-11'))
    const pastDate = new Date('2024-01-01')
    expect(calculateDaysUntilExpiry(pastDate)).toBe(-10)
  })

  it('should return 0 for same day', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00'))
    const sameDay = new Date('2024-01-01T23:59:59')
    expect(calculateDaysUntilExpiry(sameDay)).toBe(1)
  })
})

describe('isExpired', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should return true for past date', () => {
    vi.setSystemTime(new Date('2024-01-11'))
    expect(isExpired(new Date('2024-01-01'))).toBe(true)
  })

  it('should return false for future date', () => {
    vi.setSystemTime(new Date('2024-01-01'))
    expect(isExpired(new Date('2024-01-11'))).toBe(false)
  })
})

describe('formatDate', () => {
  it('should format date to Brazilian format', () => {
    expect(formatDate('2024-01-15')).toBe('15/01/2024')
  })

  it('should handle Date object', () => {
    expect(formatDate(new Date('2024-01-15'))).toBe('15/01/2024')
  })
})

describe('generateId', () => {
  it('should generate unique IDs', () => {
    const id1 = generateId()
    const id2 = generateId()
    expect(id1).not.toBe(id2)
  })

  it('should return a string', () => {
    expect(typeof generateId()).toBe('string')
  })

  it('should not be empty', () => {
    expect(generateId().length).toBeGreaterThan(0)
  })
})
