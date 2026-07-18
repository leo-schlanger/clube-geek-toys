import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock pdf-lib — all values must be inline (no references to outer variables due to hoisting)
vi.mock('pdf-lib', () => {
  const mockFont = {
    widthOfTextAtSize: vi.fn().mockReturnValue(100),
  }

  const mockPage = {
    drawText: vi.fn(),
    drawImage: vi.fn(),
    drawLine: vi.fn(),
    drawRectangle: vi.fn(),
  }

  const mockEmbedPng = vi.fn().mockResolvedValue({ width: 200, height: 100 })
  const mockEmbedJpg = vi.fn().mockResolvedValue({ width: 200, height: 100 })
  const mockAddPage = vi.fn().mockReturnValue(mockPage)
  const mockSave = vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70]))

  return {
    PDFDocument: {
      create: vi.fn().mockResolvedValue({
        embedFont: vi.fn().mockResolvedValue(mockFont),
        embedPng: mockEmbedPng,
        embedJpg: mockEmbedJpg,
        addPage: mockAddPage,
        save: mockSave,
      }),
    },
    rgb: vi.fn((r: number, g: number, b: number) => ({ r, g, b })),
    StandardFonts: {
      Helvetica: 'Helvetica',
      HelveticaBold: 'HelveticaBold',
    },
  }
})

// Mock fetch for logo loading
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock atob for signature decoding
vi.stubGlobal('atob', vi.fn().mockReturnValue('fakedata'))

// Mock logger
vi.mock('./logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

import { generateContractPDF, pdfToBase64, createPDFBlob, downloadPDF } from './contract-generator'
import { PDFDocument } from 'pdf-lib'

describe('contract-generator', () => {
  const defaultParams = {
    memberId: 'member-123',
    memberName: 'John Doe',
    memberCPF: '123.456.789-00',
    memberEmail: 'john@example.com',
    memberPhone: '(21) 99999-9999',
    plan: 'gold' as const,
    paymentType: 'monthly' as const,
    signatureImage: 'data:image/png;base64,iVBORw0KGgo=',
    signedAt: '2026-01-15T10:30:00Z',
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    documentHash: 'abc123def456',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Default: logo fetch fails (no logo)
    mockFetch.mockRejectedValue(new Error('no logo'))
  })

  describe('generateContractPDF', () => {
    it('should return a Uint8Array', async () => {
      const result = await generateContractPDF(defaultParams)
      expect(result).toBeInstanceOf(Uint8Array)
    })

    it('should call PDFDocument.create', async () => {
      await generateContractPDF(defaultParams)
      expect(PDFDocument.create).toHaveBeenCalled()
    })

    it('should produce output bytes', async () => {
      const result = await generateContractPDF(defaultParams)
      expect(result.length).toBeGreaterThan(0)
    })

    it('should handle silver plan with annual payment', async () => {
      const result = await generateContractPDF({
        ...defaultParams,
        plan: 'silver',
        paymentType: 'annual',
      })
      expect(result).toBeInstanceOf(Uint8Array)
    })

    it('should handle black plan', async () => {
      const result = await generateContractPDF({
        ...defaultParams,
        plan: 'black',
      })
      expect(result).toBeInstanceOf(Uint8Array)
    })

    it('should try to fetch logo', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('no jpg'))
        .mockRejectedValueOnce(new Error('no png'))

      await generateContractPDF(defaultParams)
      expect(mockFetch).toHaveBeenCalledWith('/logo.jpg')
    })

    it('should handle long user agents', async () => {
      const longUA = 'A'.repeat(200)
      const result = await generateContractPDF({ ...defaultParams, userAgent: longUA })
      expect(result).toBeInstanceOf(Uint8Array)
    })
  })

  describe('pdfToBase64', () => {
    it('should convert Uint8Array to base64 string', () => {
      const input = new Uint8Array([72, 101, 108, 108, 111]) // "Hello"
      const result = pdfToBase64(input)
      expect(typeof result).toBe('string')
      expect(result).toBe(btoa('Hello'))
    })

    it('should handle empty array', () => {
      const result = pdfToBase64(new Uint8Array([]))
      expect(result).toBe('')
    })

    it('should handle single byte', () => {
      const result = pdfToBase64(new Uint8Array([65])) // 'A'
      expect(result).toBe(btoa('A'))
    })
  })

  describe('createPDFBlob', () => {
    it('should return a Blob with application/pdf type', () => {
      const input = new Uint8Array([37, 80, 68, 70])
      const blob = createPDFBlob(input)
      expect(blob).toBeInstanceOf(Blob)
      expect(blob.type).toBe('application/pdf')
    })
  })

  describe('downloadPDF', () => {
    it('should create an anchor element and trigger click', () => {
      const createObjectURLSpy = vi.fn().mockReturnValue('blob:test-url')
      const revokeObjectURLSpy = vi.fn()

      vi.stubGlobal('URL', {
        createObjectURL: createObjectURLSpy,
        revokeObjectURL: revokeObjectURLSpy,
      })

      // Use a real anchor element so jsdom appendChild accepts it
      const realAnchor = document.createElement('a')
      const clickMock = vi.fn()
      realAnchor.click = clickMock

      const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(realAnchor as HTMLAnchorElement)
      const appendChildSpy = vi.spyOn(document.body, 'appendChild')

      const input = new Uint8Array([37, 80, 68, 70])
      downloadPDF(input, 'contract.pdf')

      expect(createElementSpy).toHaveBeenCalledWith('a')
      expect(createObjectURLSpy).toHaveBeenCalled()
      expect(clickMock).toHaveBeenCalled()
      expect(appendChildSpy).toHaveBeenCalled()
      expect(realAnchor.download).toBe('contract.pdf')

      appendChildSpy.mockRestore()
      createElementSpy.mockRestore()
    })
  })
})
