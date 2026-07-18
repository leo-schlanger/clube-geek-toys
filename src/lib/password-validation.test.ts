import { describe, it, expect } from 'vitest'
import {
  PASSWORD_MIN_LENGTH,
  validatePassword,
  passwordError,
} from './password-validation'
import type { PasswordValidationResult } from './password-validation'

// ── Constants ────────────────────────────────────────────────────

describe('PASSWORD_MIN_LENGTH', () => {
  it('should be 8', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8)
  })
})

// ── validatePassword ─────────────────────────────────────────────

describe('validatePassword', () => {
  // --- valid passwords ---

  it('accepts a password meeting all requirements', () => {
    const result = validatePassword('Abcdefg1')
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('accepts a long strong password', () => {
    const result = validatePassword('SuperSecret123!')
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  // --- length rule ---

  it('rejects empty string', () => {
    const result = validatePassword('')
    expect(result.valid).toBe(false)
    expect(result.errors).toContain(
      `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`,
    )
  })

  it('rejects password shorter than 8 characters', () => {
    const result = validatePassword('Abc1')
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('pelo menos 8 caracteres'))).toBe(true)
  })

  it('accepts password with exactly 8 characters', () => {
    const result = validatePassword('Abcdefg1') // 8 chars
    expect(result.valid).toBe(true)
  })

  // --- uppercase rule ---

  it('rejects password without uppercase letter', () => {
    const result = validatePassword('abcdefg1')
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('letra maiúscula'))).toBe(true)
  })

  // --- digit rule ---

  it('rejects password without digit', () => {
    const result = validatePassword('Abcdefgh')
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('número'))).toBe(true)
  })

  // --- multiple errors ---

  it('returns all errors when all rules fail', () => {
    const result = validatePassword('abc')
    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(3)
  })

  it('returns two errors when length and digit are missing', () => {
    const result = validatePassword('Abc')
    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(2)
    expect(result.errors.some((e) => e.includes('caracteres'))).toBe(true)
    expect(result.errors.some((e) => e.includes('número'))).toBe(true)
  })

  // --- strength heuristic ---

  describe('strength scoring', () => {
    it('returns weak for short lowercase password', () => {
      // score: 0 (no length >=8, no length >=12, no uppercase, no digit, no special)
      const result = validatePassword('abc')
      expect(result.strength).toBe('weak')
    })

    it('returns weak for password meeting only length requirement', () => {
      // score: 1 (length >=8 only)
      const result = validatePassword('abcdefgh')
      expect(result.strength).toBe('weak')
    })

    it('returns weak for score=2 (length + digit, no uppercase)', () => {
      // score: 2 (length >=8 + digit)
      const result = validatePassword('abcdefg1')
      expect(result.strength).toBe('weak')
    })

    it('returns medium for score=3 (length + uppercase + digit)', () => {
      // score: 3 (length >=8 + uppercase + digit)
      const result = validatePassword('Abcdefg1')
      expect(result.strength).toBe('medium')
    })

    it('returns medium for score=4 (length + long + uppercase + digit)', () => {
      // score: 4 (length >=8 + length >=12 + uppercase + digit)
      const result = validatePassword('Abcdefghijk1')
      expect(result.strength).toBe('medium')
    })

    it('returns strong for score=5 (all criteria)', () => {
      // score: 5 (length >=8 + length >=12 + uppercase + digit + special)
      const result = validatePassword('Abcdefghijk1!')
      expect(result.strength).toBe('strong')
    })

    it('returns medium for score=4 (length + uppercase + digit + special, < 12)', () => {
      // score: 4 (length >=8 + uppercase + digit + special), not >=12
      const result = validatePassword('Abcdef1!')
      expect(result.strength).toBe('medium')
    })
  })

  // --- result type ---

  it('returns correct shape for valid result', () => {
    const result: PasswordValidationResult = validatePassword('Valid1234')
    expect(result).toHaveProperty('valid')
    expect(result).toHaveProperty('errors')
    expect(result).toHaveProperty('strength')
    expect(Array.isArray(result.errors)).toBe(true)
    expect(['weak', 'medium', 'strong']).toContain(result.strength)
  })
})

// ── passwordError ────────────────────────────────────────────────

describe('passwordError', () => {
  it('returns null for a valid password', () => {
    expect(passwordError('ValidPass1')).toBeNull()
  })

  it('returns first error message for invalid password', () => {
    const error = passwordError('')
    expect(error).not.toBeNull()
    expect(typeof error).toBe('string')
    // First error is the length error
    expect(error!).toContain('pelo menos 8 caracteres')
  })

  it('returns the length error first when password is too short', () => {
    const error = passwordError('ab')
    expect(error).not.toBeNull()
    expect(error!).toContain('pelo menos 8 caracteres')
  })

  it('returns the uppercase error when only that rule fails', () => {
    const error = passwordError('abcdefg1')
    expect(error).not.toBeNull()
    expect(error!).toContain('letra maiúscula')
  })

  it('returns the digit error when only that rule fails', () => {
    const error = passwordError('Abcdefgh')
    expect(error).not.toBeNull()
    expect(error!).toContain('número')
  })
})
