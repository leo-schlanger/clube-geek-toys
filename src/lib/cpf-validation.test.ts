import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  validateCPFFormat,
  validateCPFExistence,
  isValidCPFFormat,
  fullCPFValidation,
} from './cpf-validation'
import type { CPFValidationResult } from './cpf-validation'

// Mock the logger module to prevent console noise
vi.mock('./logger', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// ── validateCPFFormat ────────────────────────────────────────────

describe('validateCPFFormat', () => {
  it('accepts a valid CPF without mask', () => {
    expect(validateCPFFormat('52998224725')).toBe(true)
  })

  it('accepts a valid CPF with mask', () => {
    expect(validateCPFFormat('529.982.247-25')).toBe(true)
  })

  it('accepts another valid CPF', () => {
    expect(validateCPFFormat('11144477735')).toBe(true)
  })

  it('accepts CPF 123.456.789-09', () => {
    expect(validateCPFFormat('12345678909')).toBe(true)
  })

  it('rejects CPF that is too short', () => {
    expect(validateCPFFormat('12345')).toBe(false)
  })

  it('rejects CPF that is too long', () => {
    expect(validateCPFFormat('123456789012')).toBe(false)
  })

  it('rejects CPF with all same digits', () => {
    expect(validateCPFFormat('00000000000')).toBe(false)
    expect(validateCPFFormat('11111111111')).toBe(false)
    expect(validateCPFFormat('99999999999')).toBe(false)
  })

  it('rejects CPF with invalid first check digit', () => {
    expect(validateCPFFormat('12345678900')).toBe(false)
  })

  it('rejects CPF with invalid second check digit', () => {
    expect(validateCPFFormat('52998224726')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(validateCPFFormat('')).toBe(false)
  })

  it('strips non-digit characters before validation', () => {
    expect(validateCPFFormat('529.982.247-25')).toBe(true)
  })
})

// ── isValidCPFFormat ─────────────────────────────────────────────

describe('isValidCPFFormat', () => {
  it('delegates to validateCPFFormat for valid CPF', () => {
    expect(isValidCPFFormat('52998224725')).toBe(true)
  })

  it('delegates to validateCPFFormat for invalid CPF', () => {
    expect(isValidCPFFormat('12345678900')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isValidCPFFormat('')).toBe(false)
  })
})

// ── validateCPFExistence (async, mocked fetch) ───────────────────

describe('validateCPFExistence', () => {
  const validCPF = '52998224725'
  const invalidFormatCPF = '12345678900'

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns invalid when CPF format is wrong', async () => {
    const result = await validateCPFExistence(invalidFormatCPF)
    expect(result.valid).toBe(false)
    expect(result.exists).toBe(false)
    expect(result.message).toContain('formato incorreto')
    // fetch should NOT be called for invalid format
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns valid+exists when API returns 200', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ nome: 'JOAO DA SILVA' }),
    } as Response)

    const result = await validateCPFExistence(validCPF)
    expect(result.valid).toBe(true)
    expect(result.exists).toBe(true)
    expect(result.name).toBe('JOAO DA SILVA')
    expect(result.message).toContain('JOAO DA SILVA')
  })

  it('returns valid+exists=null when API returns 404', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({}),
    } as Response)

    const result = await validateCPFExistence(validCPF)
    expect(result.valid).toBe(true)
    expect(result.exists).toBeNull()
    expect(result.message).toContain('não verificado')
  })

  it('returns invalid when API returns 400', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({}),
    } as Response)

    const result = await validateCPFExistence(validCPF)
    expect(result.valid).toBe(false)
    expect(result.exists).toBe(false)
    expect(result.message).toContain('inválido')
  })

  it('returns valid+exists=null for other API errors (e.g. 500)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response)

    const result = await validateCPFExistence(validCPF)
    expect(result.valid).toBe(true)
    expect(result.exists).toBeNull()
    expect(result.message).toContain('indisponível')
  })

  it('returns valid+exists=null on network error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))

    const result = await validateCPFExistence(validCPF)
    expect(result.valid).toBe(true)
    expect(result.exists).toBeNull()
    expect(result.message).toContain('offline')
  })

  it('returns valid+exists=null on abort/timeout', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError')
    vi.mocked(fetch).mockRejectedValueOnce(abortError)

    const result = await validateCPFExistence(validCPF)
    expect(result.valid).toBe(true)
    expect(result.exists).toBeNull()
    expect(result.message).toContain('offline')
  })

  it('calls the correct Brasil API URL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ nome: 'MARIA' }),
    } as Response)

    await validateCPFExistence(validCPF)

    expect(fetch).toHaveBeenCalledWith(
      `https://brasilapi.com.br/api/cpf/v1/${validCPF}`,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        headers: { Accept: 'application/json' },
      }),
    )
  })

  it('strips mask before calling API', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ nome: 'TEST' }),
    } as Response)

    await validateCPFExistence('529.982.247-25')

    expect(fetch).toHaveBeenCalledWith(
      'https://brasilapi.com.br/api/cpf/v1/52998224725',
      expect.anything(),
    )
  })

  it('returns correct CPFValidationResult shape', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ nome: 'TEST' }),
    } as Response)

    const result: CPFValidationResult = await validateCPFExistence(validCPF)
    expect(result).toHaveProperty('valid')
    expect(result).toHaveProperty('exists')
    expect(result).toHaveProperty('message')
  })
})

// ── fullCPFValidation ────────────────────────────────────────────

describe('fullCPFValidation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('delegates to validateCPFExistence', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ nome: 'DELEGATE TEST' }),
    } as Response)

    const result = await fullCPFValidation('52998224725')
    expect(result.valid).toBe(true)
    expect(result.exists).toBe(true)
    expect(result.name).toBe('DELEGATE TEST')
  })

  it('returns invalid for bad format without calling API', async () => {
    const result = await fullCPFValidation('123')
    expect(result.valid).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })
})
