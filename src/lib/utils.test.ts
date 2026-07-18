import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  cn,
  formatCurrency,
  formatCPF,
  formatPhone,
  validateCPF,
  getStatusColor,
  getStatusLabel,
  calculateDaysUntilExpiry,
  isExpired,
  formatDate,
  generateId,
} from './utils'

// ── cn (Tailwind class merge) ────────────────────────────────────

describe('cn', () => {
  it('should merge class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('should handle conditional classes', () => {
    const shouldIncludeBar = false
    expect(cn('foo', shouldIncludeBar && 'bar', 'baz')).toBe('foo baz')
  })

  it('should merge tailwind classes (last wins)', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4')
  })

  it('should handle undefined and null', () => {
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar')
  })

  it('should handle array inputs', () => {
    expect(cn(['a', 'b'])).toBe('a b')
  })

  it('should return empty string for no arguments', () => {
    expect(cn()).toBe('')
  })

  it('should handle truthy conditional classes', () => {
    const isVisible = true
    expect(cn('base', isVisible && 'visible')).toBe('base visible')
  })

  it('should handle empty string inputs', () => {
    expect(cn('', 'ok', '')).toBe('ok')
  })
})

// ── formatCurrency ───────────────────────────────────────────────

describe('formatCurrency', () => {
  it('should format number as BRL currency', () => {
    expect(formatCurrency(1234.56)).toMatch(/R\$\s?1\.234,56/)
  })

  it('should handle zero', () => {
    expect(formatCurrency(0)).toMatch(/R\$\s?0,00/)
  })

  it('should handle negative numbers', () => {
    expect(formatCurrency(-100)).toMatch(/100,00/)
  })

  it('should handle decimal values with proper rounding', () => {
    const result = formatCurrency(49.9)
    expect(result).toContain('49,90')
  })

  it('should handle very large numbers', () => {
    const result = formatCurrency(1000000)
    expect(result).toContain('1.000.000')
  })

  it('should handle small fractional values', () => {
    const result = formatCurrency(0.01)
    expect(result).toContain('0,01')
  })
})

// ── formatCPF ────────────────────────────────────────────────────

describe('formatCPF', () => {
  it('should format CPF with mask', () => {
    expect(formatCPF('12345678900')).toBe('123.456.789-00')
  })

  it('should handle already formatted CPF', () => {
    expect(formatCPF('123.456.789-00')).toBe('123.456.789-00')
  })

  it('should return unmasked string when input is too short', () => {
    expect(formatCPF('1234')).toBe('1234')
  })

  it('should handle empty string', () => {
    expect(formatCPF('')).toBe('')
  })

  it('should strip non-digit characters before formatting', () => {
    expect(formatCPF('abc12345678900xyz')).toBe('123.456.789-00')
  })
})

// ── formatPhone ──────────────────────────────────────────────────

describe('formatPhone', () => {
  it('should format 11 digit mobile phone', () => {
    expect(formatPhone('11999998888')).toBe('(11) 99999-8888')
  })

  it('should format 10 digit landline phone', () => {
    expect(formatPhone('1199998888')).toBe('(11) 9999-8888')
  })

  it('should handle already formatted phone', () => {
    expect(formatPhone('(11) 99999-8888')).toBe('(11) 99999-8888')
  })

  it('should handle empty string', () => {
    expect(formatPhone('')).toBe('')
  })

  it('should strip non-digit characters before formatting', () => {
    // Input with mask chars: stripping produces '21987654321' (11 digits)
    expect(formatPhone('(21) 98765-4321')).toBe('(21) 98765-4321')
  })
})

// ── validateCPF ──────────────────────────────────────────────────

describe('validateCPF', () => {
  it('should validate correct CPF with mask', () => {
    expect(validateCPF('529.982.247-25')).toBe(true)
  })

  it('should validate correct CPF without mask', () => {
    expect(validateCPF('52998224725')).toBe(true)
  })

  it('should validate another valid CPF', () => {
    expect(validateCPF('111.444.777-35')).toBe(true)
  })

  it('should validate CPF 123.456.789-09', () => {
    expect(validateCPF('123.456.789-09')).toBe(true)
  })

  it('should reject CPF with wrong length (too short)', () => {
    expect(validateCPF('123')).toBe(false)
  })

  it('should reject CPF with wrong length (too long)', () => {
    expect(validateCPF('123456789001')).toBe(false)
  })

  it('should reject CPF with all repeated digits', () => {
    expect(validateCPF('11111111111')).toBe(false)
    expect(validateCPF('00000000000')).toBe(false)
    expect(validateCPF('99999999999')).toBe(false)
    expect(validateCPF('222.222.222-22')).toBe(false)
  })

  it('should reject CPF with invalid first check digit', () => {
    expect(validateCPF('12345678900')).toBe(false) // correct is ...09
  })

  it('should reject CPF with invalid second check digit', () => {
    expect(validateCPF('52998224726')).toBe(false) // correct last digit is 5
  })

  it('should handle empty string', () => {
    expect(validateCPF('')).toBe(false)
  })
})

// ── getStatusColor ───────────────────────────────────────────────

describe('getStatusColor', () => {
  it('should return green for active', () => {
    expect(getStatusColor('active')).toBe('bg-green-500')
  })

  it('should return yellow for pending', () => {
    expect(getStatusColor('pending')).toBe('bg-yellow-500')
  })

  it('should return red for inactive', () => {
    expect(getStatusColor('inactive')).toBe('bg-red-500')
  })

  it('should return red for expired', () => {
    expect(getStatusColor('expired')).toBe('bg-red-500')
  })

  it('should return gray for unknown status', () => {
    expect(getStatusColor('unknown')).toBe('bg-gray-500')
  })

  it('should return gray for empty string', () => {
    expect(getStatusColor('')).toBe('bg-gray-500')
  })
})

// ── getStatusLabel ───────────────────────────────────────────────

describe('getStatusLabel', () => {
  it('should return Ativo for active', () => {
    expect(getStatusLabel('active')).toBe('Ativo')
  })

  it('should return Pendente for pending', () => {
    expect(getStatusLabel('pending')).toBe('Pendente')
  })

  it('should return Inativo for inactive', () => {
    expect(getStatusLabel('inactive')).toBe('Inativo')
  })

  it('should return Expirado for expired', () => {
    expect(getStatusLabel('expired')).toBe('Expirado')
  })

  it('should return the status itself for unknown status', () => {
    expect(getStatusLabel('unknown')).toBe('unknown')
  })

  it('should return empty string for empty string', () => {
    expect(getStatusLabel('')).toBe('')
  })
})

// ── calculateDaysUntilExpiry ─────────────────────────────────────

describe('calculateDaysUntilExpiry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should calculate positive days until future date', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    const futureDate = new Date('2024-01-11T00:00:00Z')
    expect(calculateDaysUntilExpiry(futureDate)).toBe(10)
  })

  it('should calculate negative days for past date', () => {
    vi.setSystemTime(new Date('2024-01-11T00:00:00Z'))
    const pastDate = new Date('2024-01-01T00:00:00Z')
    expect(calculateDaysUntilExpiry(pastDate)).toBe(-10)
  })

  it('should return 1 when expiry is at end of same day', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    const sameDay = new Date('2024-01-01T23:59:59Z')
    expect(calculateDaysUntilExpiry(sameDay)).toBe(1)
  })

  it('should handle exact same timestamp', () => {
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))
    const same = new Date('2024-06-15T12:00:00Z')
    expect(calculateDaysUntilExpiry(same)).toBe(0)
  })
})

// ── isExpired ────────────────────────────────────────────────────

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

  it('should return true for date just before now', () => {
    vi.setSystemTime(new Date('2024-01-11T12:00:00Z'))
    expect(isExpired(new Date('2024-01-11T11:59:59Z'))).toBe(true)
  })

  it('should return false for date at exact same time', () => {
    vi.setSystemTime(new Date('2024-01-11T12:00:00Z'))
    // new Date(expiryDate) < new Date() is false when equal
    expect(isExpired(new Date('2024-01-11T12:00:00Z'))).toBe(false)
  })
})

// ── formatDate ───────────────────────────────────────────────────

describe('formatDate', () => {
  it('should format ISO date string to Brazilian format', () => {
    const result = formatDate('2024-01-15')
    expect(result).toContain('15')
    expect(result).toContain('01')
    expect(result).toContain('2024')
  })

  it('should handle Date object', () => {
    const result = formatDate(new Date('2024-12-25T00:00:00Z'))
    expect(result).toContain('25')
    expect(result).toContain('12')
    expect(result).toContain('2024')
  })

  it('should format date with single-digit month and day', () => {
    const result = formatDate('2024-03-05')
    expect(result).toContain('03')
    expect(result).toContain('05')
    expect(result).toContain('2024')
  })
})

// ── generateId ───────────────────────────────────────────────────

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

  it('should generate 50 unique IDs', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateId()))
    expect(ids.size).toBe(50)
  })

  it('should contain only alphanumeric characters', () => {
    const id = generateId()
    expect(id).toMatch(/^[a-z0-9]+$/)
  })
})
