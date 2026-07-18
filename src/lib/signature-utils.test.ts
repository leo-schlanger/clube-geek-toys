/**
 * Signature Utilities — Unit Tests
 *
 * Tests SHA-256 hashing, contract hash generation, IP detection,
 * user agent truncation, date formatting, signature validation,
 * and canvas emptiness detection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  generateSHA256,
  generateContractHash,
  getClientIP,
  getUserAgent,
  formatDateExtensive,
  formatTimestamp,
  validateSignatureImage,
  isSignatureEmpty,
} from './signature-utils'

// =============================================================================
// 1. generateSHA256()
// =============================================================================

describe('generateSHA256', () => {
  it('should return a 64-character hex string', async () => {
    const hash = await generateSHA256('hello')
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('should produce known SHA-256 for "hello"', async () => {
    const hash = await generateSHA256('hello')
    // Well-known SHA-256 of "hello"
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  })

  it('should produce known SHA-256 for empty string', async () => {
    const hash = await generateSHA256('')
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('should produce different hashes for different inputs', async () => {
    const hash1 = await generateSHA256('abc')
    const hash2 = await generateSHA256('abd')
    expect(hash1).not.toBe(hash2)
  })

  it('should handle UTF-8 characters', async () => {
    const hash = await generateSHA256('João da Silva — Brasil')
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('should be deterministic', async () => {
    const hash1 = await generateSHA256('deterministic')
    const hash2 = await generateSHA256('deterministic')
    expect(hash1).toBe(hash2)
  })
})

// =============================================================================
// 2. generateContractHash()
// =============================================================================

describe('generateContractHash', () => {
  const baseParams = {
    memberId: 'member-123',
    memberName: 'João da Silva',
    memberCPF: '52998224725',
    memberEmail: 'joao@email.com',
    plan: 'gold',
    signedAt: '2026-05-11T10:00:00Z',
    ipAddress: '192.168.1.1',
  }

  it('should return a valid SHA-256 hash', async () => {
    const hash = await generateContractHash(baseParams)
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('should produce deterministic output for same params', async () => {
    const hash1 = await generateContractHash(baseParams)
    const hash2 = await generateContractHash(baseParams)
    expect(hash1).toBe(hash2)
  })

  it('should produce different hash when memberId changes', async () => {
    const hash1 = await generateContractHash(baseParams)
    const hash2 = await generateContractHash({ ...baseParams, memberId: 'member-456' })
    expect(hash1).not.toBe(hash2)
  })

  it('should produce different hash when plan changes', async () => {
    const hash1 = await generateContractHash(baseParams)
    const hash2 = await generateContractHash({ ...baseParams, plan: 'black' })
    expect(hash1).not.toBe(hash2)
  })

  it('should produce different hash when IP changes', async () => {
    const hash1 = await generateContractHash(baseParams)
    const hash2 = await generateContractHash({ ...baseParams, ipAddress: '10.0.0.1' })
    expect(hash1).not.toBe(hash2)
  })

  it('should concatenate all fields with pipe separator', async () => {
    // We can verify by computing the expected hash manually
    const dataString = [
      baseParams.memberId,
      baseParams.memberName,
      baseParams.memberCPF,
      baseParams.memberEmail,
      baseParams.plan,
      baseParams.signedAt,
      baseParams.ipAddress,
    ].join('|')
    const expectedHash = await generateSHA256(dataString)
    const contractHash = await generateContractHash(baseParams)
    expect(contractHash).toBe(expectedHash)
  })
})

// =============================================================================
// 3. getClientIP()
// =============================================================================

describe('getClientIP', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should return IP from ipify API', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ ip: '203.0.113.42' }),
    })

    const ip = await getClientIP()
    expect(ip).toBe('203.0.113.42')
  })

  it('should call ipify with correct URL and timeout', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ ip: '1.2.3.4' }),
    })

    await getClientIP()
    expect(global.fetch).toHaveBeenCalledWith('https://api.ipify.org?format=json', {
      signal: expect.any(AbortSignal),
    })
  })

  it('should return fallback when fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const ip = await getClientIP()
    expect(ip).toBe('Não identificado')
  })

  it('should return fallback when response has no ip field', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({}),
    })

    const ip = await getClientIP()
    expect(ip).toBe('Não identificado')
  })

  it('should return fallback when json parsing fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.reject(new Error('Invalid JSON')),
    })

    const ip = await getClientIP()
    expect(ip).toBe('Não identificado')
  })
})

// =============================================================================
// 4. getUserAgent()
// =============================================================================

describe('getUserAgent', () => {
  const originalUserAgent = navigator.userAgent

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      configurable: true,
    })
  })

  it('should return navigator.userAgent when shorter than maxLength', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 TestBrowser',
      configurable: true,
    })

    const ua = getUserAgent()
    expect(ua).toBe('Mozilla/5.0 TestBrowser')
  })

  it('should truncate with ellipsis when exceeding maxLength', () => {
    const longUA = 'A'.repeat(150)
    Object.defineProperty(navigator, 'userAgent', {
      value: longUA,
      configurable: true,
    })

    const ua = getUserAgent(100)
    expect(ua).toHaveLength(103) // 100 chars + "..."
    expect(ua.endsWith('...')).toBe(true)
  })

  it('should use custom maxLength parameter', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'A'.repeat(50),
      configurable: true,
    })

    const ua = getUserAgent(20)
    expect(ua).toHaveLength(23) // 20 + "..."
    expect(ua.endsWith('...')).toBe(true)
  })

  it('should not truncate when exactly at maxLength', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'A'.repeat(100),
      configurable: true,
    })

    const ua = getUserAgent(100)
    expect(ua).toHaveLength(100)
    expect(ua.endsWith('...')).toBe(false)
  })

  it('should return user agent as-is when shorter than default maxLength', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Short UA',
      configurable: true,
    })

    const ua = getUserAgent()
    expect(ua).toBe('Short UA')
  })
})

// =============================================================================
// 5. formatDateExtensive()
// =============================================================================

describe('formatDateExtensive', () => {
  it('should format January date correctly', () => {
    const date = new Date(2026, 0, 5, 14, 30) // Jan 5, 2026, 14:30
    expect(formatDateExtensive(date)).toBe('5 de janeiro de 2026, às 14:30')
  })

  it('should format December date correctly', () => {
    const date = new Date(2026, 11, 25, 9, 5) // Dec 25, 2026, 09:05
    expect(formatDateExtensive(date)).toBe('25 de dezembro de 2026, às 09:05')
  })

  it('should zero-pad hours and minutes', () => {
    const date = new Date(2026, 4, 1, 3, 7) // May 1, 2026, 03:07
    expect(formatDateExtensive(date)).toBe('1 de maio de 2026, às 03:07')
  })

  it('should handle midnight correctly', () => {
    const date = new Date(2026, 6, 15, 0, 0) // Jul 15, 2026, 00:00
    expect(formatDateExtensive(date)).toBe('15 de julho de 2026, às 00:00')
  })

  it('should handle end of day', () => {
    const date = new Date(2026, 2, 10, 23, 59) // Mar 10, 2026, 23:59
    expect(formatDateExtensive(date)).toBe('10 de março de 2026, às 23:59')
  })

  it('should use all 12 months in Portuguese', () => {
    const months = [
      'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
    ]
    months.forEach((monthName, i) => {
      const date = new Date(2026, i, 1, 12, 0)
      const formatted = formatDateExtensive(date)
      expect(formatted).toContain(monthName)
    })
  })
})

// =============================================================================
// 6. formatTimestamp()
// =============================================================================

describe('formatTimestamp', () => {
  it('should format ISO string to pt-BR locale', () => {
    // Using a date that is the same regardless of timezone offset
    const result = formatTimestamp('2026-05-11T00:00:00Z')
    // The exact output depends on timezone, but should match pt-BR format
    expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/)
    expect(result).toMatch(/\d{2}:\d{2}:\d{2}/)
  })

  it('should include day, month, year, hour, minute, second', () => {
    const result = formatTimestamp('2026-01-15T10:30:45Z')
    // Should contain the date parts (exact values depend on timezone)
    expect(result).toMatch(/\d{2}\/\d{2}\/2026/)
    expect(result).toMatch(/\d{2}:\d{2}:\d{2}/)
  })

  it('should handle date-only ISO string', () => {
    const result = formatTimestamp('2026-12-25')
    expect(result).toMatch(/\d{2}\/\d{2}\/2026/)
  })
})

// =============================================================================
// 7. validateSignatureImage()
// =============================================================================

describe('validateSignatureImage', () => {
  it('should return false for empty string', () => {
    expect(validateSignatureImage('')).toBe(false)
  })

  it('should return false for non-PNG data URL', () => {
    expect(validateSignatureImage('data:image/jpeg;base64,abc')).toBe(false)
  })

  it('should return false for PNG with insufficient data (too small)', () => {
    const smallData = 'data:image/png;base64,' + 'A'.repeat(500)
    expect(validateSignatureImage(smallData)).toBe(false)
  })

  it('should return true for PNG with sufficient data', () => {
    const validData = 'data:image/png;base64,' + 'A'.repeat(2000)
    expect(validateSignatureImage(validData)).toBe(true)
  })

  it('should return false for plain text', () => {
    expect(validateSignatureImage('hello world')).toBe(false)
  })

  it('should return false for base64 without data URL prefix', () => {
    expect(validateSignatureImage('A'.repeat(2000))).toBe(false)
  })

  it('should return true at exactly 1000 characters of base64 data', () => {
    const data = 'data:image/png;base64,' + 'A'.repeat(1000)
    expect(validateSignatureImage(data)).toBe(true)
  })

  it('should return false at 999 characters of base64 data', () => {
    const data = 'data:image/png;base64,' + 'A'.repeat(999)
    expect(validateSignatureImage(data)).toBe(false)
  })
})

// =============================================================================
// 8. isSignatureEmpty()
// =============================================================================

describe('isSignatureEmpty', () => {
  function createMockCanvas(pixels: number[]): HTMLCanvasElement {
    const imageData = { data: new Uint8ClampedArray(pixels), width: 1, height: pixels.length / 4 }
    const ctx = {
      getImageData: vi.fn().mockReturnValue(imageData),
    }
    return {
      width: 1,
      height: pixels.length / 4,
      getContext: vi.fn().mockReturnValue(ctx),
    } as unknown as HTMLCanvasElement
  }

  it('should return true for all-white canvas', () => {
    // 2 white pixels: RGBA(255,255,255,255) x 2
    const canvas = createMockCanvas([
      255, 255, 255, 255,
      255, 255, 255, 255,
    ])
    expect(isSignatureEmpty(canvas)).toBe(true)
  })

  it('should return true for fully transparent canvas', () => {
    // Fully transparent pixels: RGBA(0,0,0,0)
    const canvas = createMockCanvas([
      0, 0, 0, 0,
      0, 0, 0, 0,
    ])
    expect(isSignatureEmpty(canvas)).toBe(true)
  })

  it('should return false when a dark pixel exists', () => {
    // One white pixel and one black pixel
    const canvas = createMockCanvas([
      255, 255, 255, 255,
      0, 0, 0, 255,       // Black, fully opaque — content
    ])
    expect(isSignatureEmpty(canvas)).toBe(false)
  })

  it('should return false for colored pixel with opacity', () => {
    const canvas = createMockCanvas([
      100, 50, 200, 128,  // Purple, semi-transparent — content
    ])
    expect(isSignatureEmpty(canvas)).toBe(false)
  })

  it('should return true when context is null', () => {
    const canvas = {
      width: 100,
      height: 100,
      getContext: vi.fn().mockReturnValue(null),
    } as unknown as HTMLCanvasElement
    expect(isSignatureEmpty(canvas)).toBe(true)
  })

  it('should return true for near-white pixels (r=250, g=250, b=250)', () => {
    // Pixels with values >= 250 are treated as white
    const canvas = createMockCanvas([
      250, 250, 250, 255,
      251, 252, 253, 100,
    ])
    expect(isSignatureEmpty(canvas)).toBe(true)
  })

  it('should return false for pixel just below the white threshold', () => {
    // r=249 is below the 250 threshold
    const canvas = createMockCanvas([
      249, 255, 255, 255,
    ])
    expect(isSignatureEmpty(canvas)).toBe(false)
  })

  it('should return true for dark color with zero alpha (transparent)', () => {
    // Black color but fully transparent — no visible content
    const canvas = createMockCanvas([
      0, 0, 0, 0,
    ])
    expect(isSignatureEmpty(canvas)).toBe(true)
  })

  it('should call getContext with "2d"', () => {
    const getContextMock = vi.fn().mockReturnValue({
      getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray([255, 255, 255, 255]) }),
    })
    const canvas = { width: 1, height: 1, getContext: getContextMock } as unknown as HTMLCanvasElement
    isSignatureEmpty(canvas)
    expect(getContextMock).toHaveBeenCalledWith('2d')
  })
})
