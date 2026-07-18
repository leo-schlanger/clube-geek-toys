/**
 * Email API client — Unit Tests
 *
 * Tests all exported functions from email.ts.
 * Mocks api-client and logger modules.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock api-client
vi.mock('./api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

// Mock logger
vi.mock('./logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import { api } from './api-client'
import {
  sendWelcomeEmail,
  sendPaymentConfirmedEmail,
  sendPaymentFailedEmail,
  sendRenewalReminderEmail,
  sendPointsExpiringEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendContractEmail,
  resendContractEmail,
  verifyEmailToken,
} from './email'

const mockedApi = vi.mocked(api)

// ============================================
// Tests
// ============================================

describe('Email API client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---- sendWelcomeEmail ----

  describe('sendWelcomeEmail', () => {
    it('should POST /email/send with welcome template', async () => {
      mockedApi.post.mockResolvedValue({ data: { message: 'sent', id: 'email-1' }, status: 200 })

      const result = await sendWelcomeEmail('user@test.com', 'John', 'Gold', 'member-1')

      expect(mockedApi.post).toHaveBeenCalledWith('/email/send', {
        template: 'welcome',
        to: 'user@test.com',
        variables: { name: 'John', plan: 'Gold' },
        member_id: 'member-1',
      })
      expect(result).toEqual({ success: true, message: 'sent', id: 'email-1' })
    })

    it('should return error when API returns error', async () => {
      mockedApi.post.mockResolvedValue({ error: 'Invalid email', status: 400 })

      const result = await sendWelcomeEmail('bad', 'John', 'Gold')

      expect(result).toEqual({ success: false, error: 'Invalid email' })
    })

    it('should return error on exception', async () => {
      mockedApi.post.mockRejectedValue(new Error('Network error'))

      const result = await sendWelcomeEmail('user@test.com', 'John', 'Gold')

      expect(result).toEqual({ success: false, error: 'Erro ao enviar email' })
    })

    it('should work without memberId', async () => {
      mockedApi.post.mockResolvedValue({ data: { message: 'sent' }, status: 200 })

      const result = await sendWelcomeEmail('user@test.com', 'John', 'Gold')

      expect(mockedApi.post).toHaveBeenCalledWith('/email/send', {
        template: 'welcome',
        to: 'user@test.com',
        variables: { name: 'John', plan: 'Gold' },
        member_id: undefined,
      })
      expect(result.success).toBe(true)
    })
  })

  // ---- sendPaymentConfirmedEmail ----

  describe('sendPaymentConfirmedEmail', () => {
    it('should POST /email/send with payment-confirmed template and formatted values', async () => {
      mockedApi.post.mockResolvedValue({ data: { message: 'sent' }, status: 200 })

      const result = await sendPaymentConfirmedEmail(
        'user@test.com', 'Jane', 39.90, 'Gold', '2027-01-15T00:00:00Z', 'member-1'
      )

      expect(mockedApi.post).toHaveBeenCalledWith('/email/send', {
        template: 'payment-confirmed',
        to: 'user@test.com',
        variables: {
          name: 'Jane',
          amount: '39,90',
          plan: 'Gold',
          expiry_date: new Date('2027-01-15T00:00:00Z').toLocaleDateString('pt-BR'),
        },
        member_id: 'member-1',
      })
      expect(result.success).toBe(true)
    })

    it('should format amount with two decimal places', async () => {
      mockedApi.post.mockResolvedValue({ data: {}, status: 200 })

      await sendPaymentConfirmedEmail('a@b.com', 'Test', 100, 'Black', '2027-01-01')

      const call = mockedApi.post.mock.calls[0]
      const variables = call[1]?.variables as Record<string, string>
      expect(variables.amount).toBe('100,00')
    })
  })

  // ---- sendPaymentFailedEmail ----

  describe('sendPaymentFailedEmail', () => {
    it('should POST /email/send with payment-failed template', async () => {
      mockedApi.post.mockResolvedValue({ data: { message: 'sent' }, status: 200 })

      const result = await sendPaymentFailedEmail('user@test.com', 'Bob', 39.90, 'Card declined', 'member-1')

      expect(mockedApi.post).toHaveBeenCalledWith('/email/send', {
        template: 'payment-failed',
        to: 'user@test.com',
        variables: { name: 'Bob' },
        member_id: 'member-1',
      })
      expect(result.success).toBe(true)
    })

    it('should work without optional amount and reason', async () => {
      mockedApi.post.mockResolvedValue({ data: {}, status: 200 })

      const result = await sendPaymentFailedEmail('user@test.com', 'Bob')

      expect(result.success).toBe(true)
    })
  })

  // ---- sendRenewalReminderEmail ----

  describe('sendRenewalReminderEmail', () => {
    it('should POST /email/send with renewal-reminder template', async () => {
      mockedApi.post.mockResolvedValue({ data: { message: 'sent' }, status: 200 })

      const result = await sendRenewalReminderEmail('user@test.com', 'Alice', '2026-12-31T00:00:00Z', 'member-1')

      expect(mockedApi.post).toHaveBeenCalledWith('/email/send', {
        template: 'renewal-reminder',
        to: 'user@test.com',
        variables: {
          name: 'Alice',
          expiry_date: new Date('2026-12-31T00:00:00Z').toLocaleDateString('pt-BR'),
        },
        member_id: 'member-1',
      })
      expect(result.success).toBe(true)
    })
  })

  // ---- sendPointsExpiringEmail ----

  describe('sendPointsExpiringEmail', () => {
    it('should POST /email/send with points-expiring template', async () => {
      mockedApi.post.mockResolvedValue({ data: { message: 'sent' }, status: 200 })

      const result = await sendPointsExpiringEmail(
        'user@test.com', 'Carlos', 500, '2026-08-01T00:00:00Z', 'member-1'
      )

      expect(mockedApi.post).toHaveBeenCalledWith('/email/send', {
        template: 'points-expiring',
        to: 'user@test.com',
        variables: {
          name: 'Carlos',
          points: '500',
          expiry_date: new Date('2026-08-01T00:00:00Z').toLocaleDateString('pt-BR'),
        },
        member_id: 'member-1',
      })
      expect(result.success).toBe(true)
    })

    it('should convert points number to string', async () => {
      mockedApi.post.mockResolvedValue({ data: {}, status: 200 })

      await sendPointsExpiringEmail('a@b.com', 'X', 1234, '2026-08-01')

      const call = mockedApi.post.mock.calls[0]
      const variables = call[1]?.variables as Record<string, string>
      expect(variables.points).toBe('1234')
    })
  })

  // ---- sendVerificationEmail ----

  describe('sendVerificationEmail', () => {
    it('should POST /auth/send-verification-email', async () => {
      mockedApi.post.mockResolvedValue({ data: { ok: true }, status: 200 })

      const result = await sendVerificationEmail('user@test.com', 'uid-123', 'John')

      expect(mockedApi.post).toHaveBeenCalledWith('/auth/send-verification-email', {
        email: 'user@test.com',
        uid: 'uid-123',
        name: 'John',
      })
      expect(result).toEqual({ success: true, message: 'Verification email sent' })
    })

    it('should work without name', async () => {
      mockedApi.post.mockResolvedValue({ data: {}, status: 200 })

      const result = await sendVerificationEmail('user@test.com', 'uid-123')

      expect(mockedApi.post).toHaveBeenCalledWith('/auth/send-verification-email', {
        email: 'user@test.com',
        uid: 'uid-123',
        name: undefined,
      })
      expect(result.success).toBe(true)
    })

    it('should return error when API returns error', async () => {
      mockedApi.post.mockResolvedValue({ error: 'Rate limited', status: 429 })

      const result = await sendVerificationEmail('user@test.com', 'uid-123')

      expect(result).toEqual({ success: false, error: 'Rate limited' })
    })

    it('should return error on exception', async () => {
      mockedApi.post.mockRejectedValue(new Error('Network error'))

      const result = await sendVerificationEmail('user@test.com', 'uid-123')

      expect(result).toEqual({ success: false, error: 'Erro ao enviar email de verificação' })
    })
  })

  // ---- sendPasswordResetEmail ----

  describe('sendPasswordResetEmail', () => {
    it('should POST /auth/send-password-reset', async () => {
      mockedApi.post.mockResolvedValue({ data: { ok: true }, status: 200 })

      const result = await sendPasswordResetEmail('user@test.com')

      expect(mockedApi.post).toHaveBeenCalledWith('/auth/send-password-reset', {
        email: 'user@test.com',
      })
      expect(result).toEqual({ success: true, message: 'Password reset email sent' })
    })

    it('should return error when API returns error', async () => {
      mockedApi.post.mockResolvedValue({ error: 'User not found', status: 404 })

      const result = await sendPasswordResetEmail('unknown@test.com')

      expect(result).toEqual({ success: false, error: 'User not found' })
    })

    it('should return error on exception', async () => {
      mockedApi.post.mockRejectedValue(new Error('Timeout'))

      const result = await sendPasswordResetEmail('user@test.com')

      expect(result).toEqual({ success: false, error: 'Erro ao enviar email de redefinição' })
    })
  })

  // ---- sendContractEmail ----

  describe('sendContractEmail', () => {
    it('should POST /email/send-contract with all fields', async () => {
      mockedApi.post.mockResolvedValue({ data: { id: 'contract-email-1' }, status: 200 })

      const result = await sendContractEmail(
        'user@test.com', 'Member Name', 'Gold',
        '2026-05-01T10:00:00Z', 'hash123', 'base64pdfdata', 'admin@test.com'
      )

      expect(mockedApi.post).toHaveBeenCalledWith('/email/send-contract', {
        to: 'user@test.com',
        member_name: 'Member Name',
        plan: 'Gold',
        signed_at: '2026-05-01T10:00:00Z',
        hash: 'hash123',
        pdf_base64: 'base64pdfdata',
        admin_email: 'admin@test.com',
      })
      expect(result).toEqual({ success: true, message: 'Contract email sent', id: 'contract-email-1' })
    })

    it('should work without adminEmail', async () => {
      mockedApi.post.mockResolvedValue({ data: {}, status: 200 })

      const result = await sendContractEmail(
        'user@test.com', 'Name', 'Silver',
        '2026-05-01', 'hash', 'pdf'
      )

      const call = mockedApi.post.mock.calls[0]
      expect(call[1]?.admin_email).toBeUndefined()
      expect(result.success).toBe(true)
    })

    it('should return error when API returns error', async () => {
      mockedApi.post.mockResolvedValue({ error: 'Payload too large', status: 413 })

      const result = await sendContractEmail(
        'user@test.com', 'Name', 'Gold', '2026-05-01', 'hash', 'pdf'
      )

      expect(result).toEqual({ success: false, error: 'Payload too large' })
    })

    it('should return error on exception', async () => {
      mockedApi.post.mockRejectedValue(new Error('Timeout'))

      const result = await sendContractEmail(
        'user@test.com', 'Name', 'Gold', '2026-05-01', 'hash', 'pdf'
      )

      expect(result).toEqual({ success: false, error: 'Erro ao enviar contrato' })
    })
  })

  // ---- resendContractEmail ----

  describe('resendContractEmail', () => {
    it('should fetch PDF from URL and forward to sendContractEmail', async () => {
      // Mock fetch for PDF download
      const pdfBytes = new Uint8Array([80, 68, 70]) // "PDF"
      const mockResponse = {
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(pdfBytes.buffer),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

      // Mock API call for sendContractEmail
      mockedApi.post.mockResolvedValue({ data: { id: 'resent-1' }, status: 200 })

      const result = await resendContractEmail(
        'user@test.com', 'Name', 'Gold',
        '2026-05-01', 'hash', 'https://example.com/contract.pdf'
      )

      expect(fetch).toHaveBeenCalledWith('https://example.com/contract.pdf')
      expect(mockedApi.post).toHaveBeenCalledWith('/email/send-contract', expect.objectContaining({
        to: 'user@test.com',
        member_name: 'Name',
        plan: 'Gold',
        signed_at: '2026-05-01',
        hash: 'hash',
      }))
      expect(result.success).toBe(true)
    })

    it('should return error when PDF fetch fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

      const result = await resendContractEmail(
        'user@test.com', 'Name', 'Gold',
        '2026-05-01', 'hash', 'https://example.com/404.pdf'
      )

      expect(result).toEqual({ success: false, error: 'Não foi possível baixar o contrato' })
      expect(mockedApi.post).not.toHaveBeenCalled()
    })

    it('should return error on fetch exception', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('DNS lookup failed')))

      const result = await resendContractEmail(
        'user@test.com', 'Name', 'Gold',
        '2026-05-01', 'hash', 'https://bad-host/contract.pdf'
      )

      expect(result).toEqual({ success: false, error: 'Erro ao reenviar contrato' })
    })
  })

  // ---- verifyEmailToken ----

  describe('verifyEmailToken', () => {
    it('should POST /auth/verify-email with token and return uid on success', async () => {
      mockedApi.post.mockResolvedValue({ data: { uid: 'user-123' }, status: 200 })

      const result = await verifyEmailToken('valid-token')

      expect(mockedApi.post).toHaveBeenCalledWith('/auth/verify-email', { token: 'valid-token' })
      expect(result).toEqual({ success: true, uid: 'user-123' })
    })

    it('should return error and code on API error', async () => {
      mockedApi.post.mockResolvedValue({
        error: 'Token expired',
        code: 'TOKEN_INVALID',
        status: 400,
      })

      const result = await verifyEmailToken('expired-token')

      expect(result).toEqual({
        success: false,
        error: 'Token expired',
        code: 'TOKEN_INVALID',
      })
    })

    it('should handle TOKEN_ALREADY_USED code', async () => {
      mockedApi.post.mockResolvedValue({
        error: 'Token already used',
        code: 'TOKEN_ALREADY_USED',
        status: 400,
      })

      const result = await verifyEmailToken('used-token')

      expect(result.code).toBe('TOKEN_ALREADY_USED')
      expect(result.success).toBe(false)
    })

    it('should return error on exception', async () => {
      mockedApi.post.mockRejectedValue(new Error('Server down'))

      const result = await verifyEmailToken('some-token')

      expect(result).toEqual({ success: false, error: 'Erro ao verificar email' })
    })
  })
})
