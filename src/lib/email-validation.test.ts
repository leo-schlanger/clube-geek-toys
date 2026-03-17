import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isValidEmailFormat,
  isDisposableEmail,
  getEmailDomain,
  validateEmailSync,
  validateEmail,
  verifyEmailDomain,
} from './email-validation'

describe('email-validation', () => {
  describe('isValidEmailFormat', () => {
    it('should accept valid emails', () => {
      expect(isValidEmailFormat('user@example.com')).toBe(true)
      expect(isValidEmailFormat('user.name@example.com')).toBe(true)
      expect(isValidEmailFormat('user+tag@example.com')).toBe(true)
      expect(isValidEmailFormat('user@subdomain.example.com')).toBe(true)
      expect(isValidEmailFormat('test123@test.co.uk')).toBe(true)
    })

    it('should reject invalid formats', () => {
      expect(isValidEmailFormat('')).toBe(false)
      expect(isValidEmailFormat('not-an-email')).toBe(false)
      expect(isValidEmailFormat('user@')).toBe(false)
      expect(isValidEmailFormat('@example.com')).toBe(false)
      expect(isValidEmailFormat('user @example.com')).toBe(false)
      expect(isValidEmailFormat('user@example')).toBe(false)
    })

    it('should reject emails exceeding length limits', () => {
      // Local part > 64 chars
      const longLocal = 'a'.repeat(65) + '@example.com'
      expect(isValidEmailFormat(longLocal)).toBe(false)

      // Domain > 253 chars
      const longDomain = 'user@' + 'a'.repeat(254) + '.com'
      expect(isValidEmailFormat(longDomain)).toBe(false)

      // Total > 254 chars
      const longEmail = 'a'.repeat(64) + '@' + 'b'.repeat(190) + '.com'
      expect(isValidEmailFormat(longEmail)).toBe(false)
    })

    it('should handle null/undefined', () => {
      expect(isValidEmailFormat(null as unknown as string)).toBe(false)
      expect(isValidEmailFormat(undefined as unknown as string)).toBe(false)
    })
  })

  describe('isDisposableEmail', () => {
    it('should detect common disposable email domains', () => {
      expect(isDisposableEmail('user@mailinator.com')).toBe(true)
      expect(isDisposableEmail('user@tempmail.com')).toBe(true)
      expect(isDisposableEmail('user@guerrillamail.com')).toBe(true)
      expect(isDisposableEmail('user@10minutemail.com')).toBe(true)
      expect(isDisposableEmail('user@yopmail.com')).toBe(true)
      expect(isDisposableEmail('user@trashmail.com')).toBe(true)
    })

    it('should allow legitimate email domains', () => {
      expect(isDisposableEmail('user@gmail.com')).toBe(false)
      expect(isDisposableEmail('user@outlook.com')).toBe(false)
      expect(isDisposableEmail('user@hotmail.com')).toBe(false)
      expect(isDisposableEmail('user@yahoo.com')).toBe(false)
      expect(isDisposableEmail('user@empresa.com.br')).toBe(false)
    })

    it('should be case-insensitive', () => {
      expect(isDisposableEmail('user@MAILINATOR.COM')).toBe(true)
      expect(isDisposableEmail('user@TempMail.Com')).toBe(true)
    })

    it('should handle empty/invalid input', () => {
      expect(isDisposableEmail('')).toBe(false)
      expect(isDisposableEmail('invalid')).toBe(false)
    })
  })

  describe('getEmailDomain', () => {
    it('should extract domain from email', () => {
      expect(getEmailDomain('user@example.com')).toBe('example.com')
      expect(getEmailDomain('USER@EXAMPLE.COM')).toBe('example.com')
    })

    it('should return null for invalid emails', () => {
      expect(getEmailDomain('')).toBe(null)
      expect(getEmailDomain('invalid')).toBe(null)
    })
  })

  describe('validateEmailSync', () => {
    it('should validate format and disposable check', () => {
      const validResult = validateEmailSync('user@gmail.com')
      expect(validResult.valid).toBe(true)
      expect(validResult.error).toBeUndefined()

      const invalidFormat = validateEmailSync('invalid-email')
      expect(invalidFormat.valid).toBe(false)
      expect(invalidFormat.error).toBe('Formato de email inválido')

      const disposable = validateEmailSync('user@mailinator.com')
      expect(disposable.valid).toBe(false)
      expect(disposable.error).toBe('Emails temporários não são permitidos')
    })
  })

  describe('verifyEmailDomain', () => {
    const originalFetch = globalThis.fetch

    beforeEach(() => {
      vi.resetAllMocks()
    })

    afterEach(() => {
      globalThis.fetch = originalFetch
      vi.restoreAllMocks()
    })

    it('should return valid for domains with MX records', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          Status: 0,
          Answer: [{ type: 15, data: 'mail.example.com' }]
        })
      }) as typeof fetch

      const result = await verifyEmailDomain('user@example.com')
      expect(result.valid).toBe(true)
      expect(result.hasMX).toBe(true)
    })

    it('should return invalid for non-existent domains', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ Status: 3 }) // NXDOMAIN
      }) as typeof fetch

      const result = await verifyEmailDomain('user@nonexistent-domain-12345.com')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Domínio não existe')
    })

    it('should handle network errors gracefully', async () => {
      globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error')) as typeof fetch

      const result = await verifyEmailDomain('user@example.com')
      // Should not block user on network error
      expect(result.valid).toBe(true)
    })

    it('should handle invalid domain input', async () => {
      const result = await verifyEmailDomain('invalid')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Domínio inválido')
    })
  })

  describe('validateEmail (async)', () => {
    const originalFetch = globalThis.fetch

    beforeEach(() => {
      vi.resetAllMocks()
    })

    afterEach(() => {
      globalThis.fetch = originalFetch
      vi.restoreAllMocks()
    })

    it('should perform full validation', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          Status: 0,
          Answer: [{ type: 15, data: 'mail.gmail.com' }]
        })
      }) as typeof fetch

      const result = await validateEmail('user@gmail.com')
      expect(result.valid).toBe(true)
    })

    it('should reject disposable emails', async () => {
      const result = await validateEmail('user@mailinator.com')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Emails temporários não são permitidos')
    })

    it('should reject invalid format before API call', async () => {
      const fetchMock = vi.fn()
      globalThis.fetch = fetchMock as typeof fetch

      const result = await validateEmail('invalid-email')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Formato de email inválido')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('should skip domain check when option is false', async () => {
      const fetchMock = vi.fn()
      globalThis.fetch = fetchMock as typeof fetch

      const result = await validateEmail('user@example.com', { checkDomain: false })
      expect(result.valid).toBe(true)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('should skip disposable check when option is false', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ Status: 0, Answer: [{ type: 15 }] })
      }) as typeof fetch

      const result = await validateEmail('user@mailinator.com', { checkDisposable: false })
      expect(result.valid).toBe(true)
    })
  })
})
