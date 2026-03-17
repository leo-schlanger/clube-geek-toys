import { describe, it, expect } from 'vitest'
import {
  sanitizeString,
  normalizeEmail,
  sanitizeName,
  normalizePhone,
  normalizeCPF,
  sanitizeMemberForm,
  sanitizeLoginForm,
} from './sanitize'

describe('sanitizeString', () => {
  it('should return empty string for falsy input', () => {
    expect(sanitizeString('')).toBe('')
  })

  it('should trim whitespace', () => {
    expect(sanitizeString('  hello  ')).toBe('hello')
  })

  it('should replace multiple spaces with single space', () => {
    expect(sanitizeString('hello   world')).toBe('hello world')
  })

  it('should remove control characters', () => {
    expect(sanitizeString('hello\x00world')).toBe('helloworld')
    expect(sanitizeString('test\x1Fvalue')).toBe('testvalue')
  })

  it('should handle combined cases', () => {
    expect(sanitizeString('  Hello   World  ')).toBe('Hello World')
  })
})

describe('normalizeEmail', () => {
  it('should return empty string for falsy input', () => {
    expect(normalizeEmail('')).toBe('')
  })

  it('should convert to lowercase', () => {
    expect(normalizeEmail('User@Email.COM')).toBe('user@email.com')
  })

  it('should trim whitespace', () => {
    expect(normalizeEmail(' user@email.com ')).toBe('user@email.com')
  })

  it('should remove internal spaces', () => {
    expect(normalizeEmail('user @email .com')).toBe('user@email.com')
  })

  it('should handle combined cases', () => {
    expect(normalizeEmail(' User@Email.COM ')).toBe('user@email.com')
  })
})

describe('sanitizeName', () => {
  it('should return empty string for falsy input', () => {
    expect(sanitizeName('')).toBe('')
  })

  it('should capitalize first letter of each word', () => {
    // Note: \b\w regex only capitalizes ASCII characters
    expect(sanitizeName('john doe')).toBe('John Doe')
  })

  it('should handle ASCII names', () => {
    expect(sanitizeName('John Smith')).toBe('John Smith')
  })

  it('should trim and normalize spaces', () => {
    expect(sanitizeName('  john   doe  ')).toBe('John Doe')
  })
})

describe('normalizePhone', () => {
  it('should return empty string for falsy input', () => {
    expect(normalizePhone('')).toBe('')
  })

  it('should format 11 digit phone number', () => {
    expect(normalizePhone('11999998888')).toBe('(11) 99999-8888')
  })

  it('should format 10 digit phone number', () => {
    expect(normalizePhone('1199998888')).toBe('(11) 9999-8888')
  })

  it('should strip non-digits from formatted phone', () => {
    expect(normalizePhone('(11) 99999-8888')).toBe('(11) 99999-8888')
  })

  it('should return digits for invalid length', () => {
    expect(normalizePhone('123')).toBe('123')
    expect(normalizePhone('12345678901234')).toBe('12345678901234')
  })
})

describe('normalizeCPF', () => {
  it('should return empty string for falsy input', () => {
    expect(normalizeCPF('')).toBe('')
  })

  it('should remove formatting from CPF', () => {
    expect(normalizeCPF('123.456.789-00')).toBe('12345678900')
  })

  it('should handle CPF without formatting', () => {
    expect(normalizeCPF('12345678900')).toBe('12345678900')
  })
})

describe('sanitizeMemberForm', () => {
  it('should sanitize all fields', () => {
    const result = sanitizeMemberForm({
      fullName: 'john silva',
      email: 'User@Email.COM',
      phone: '11999998888',
      cpf: '123.456.789-00',
    })

    expect(result).toEqual({
      fullName: 'John Silva',
      email: 'user@email.com',
      phone: '(11) 99999-8888',
      cpf: '12345678900',
    })
  })

  it('should handle undefined fields', () => {
    const result = sanitizeMemberForm({})

    expect(result).toEqual({
      fullName: undefined,
      email: undefined,
      phone: undefined,
      cpf: undefined,
    })
  })

  it('should handle partial data', () => {
    const result = sanitizeMemberForm({
      fullName: 'john silva',
    })

    expect(result.fullName).toBe('John Silva')
    expect(result.email).toBeUndefined()
  })
})

describe('sanitizeLoginForm', () => {
  it('should normalize email but not password', () => {
    const result = sanitizeLoginForm({
      email: 'User@Email.COM',
      password: 'MyP@ssw0rd!',
    })

    expect(result).toEqual({
      email: 'user@email.com',
      password: 'MyP@ssw0rd!',
    })
  })

  it('should preserve special characters in password', () => {
    const result = sanitizeLoginForm({
      email: 'user@email.com',
      password: '!@#$%^&*()',
    })

    expect(result.password).toBe('!@#$%^&*()')
  })
})
