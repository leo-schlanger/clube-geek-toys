/**
 * Contract Storage — Unit Tests
 *
 * Tests all exported functions in contract-storage.ts:
 * - uploadContractPDF
 * - saveContract
 * - getMemberContract
 * - getMemberContractHistory
 * - storeContract
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock api-client
vi.mock('./api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
  },
  getAccessToken: vi.fn(),
  tryRefreshToken: vi.fn(),
  API_URL: 'http://localhost:3001',
}))

import {
  uploadContractPDF,
  saveContract,
  getMemberContract,
  getMemberContractHistory,
  storeContract,
} from './contract-storage'
import { api, getAccessToken, tryRefreshToken } from './api-client'
import type { ContractData, Contract } from '../types'

const mockedApi = vi.mocked(api)
const mockedGetAccessToken = vi.mocked(getAccessToken)
const mockedTryRefreshToken = vi.mocked(tryRefreshToken)

// Helpers
function makeContractData(overrides: Partial<ContractData> = {}): ContractData {
  return {
    memberId: 'member-1',
    memberName: 'Joao Silva',
    memberCPF: '52998224725',
    memberEmail: 'joao@email.com',
    memberPhone: '11999998888',
    plan: 'silver',
    paymentType: 'monthly',
    signatureImage: 'data:image/png;base64,iVBOR...' + 'A'.repeat(200),
    signedAt: '2026-01-01T00:00:00.000Z',
    ipAddress: '1.2.3.4',
    userAgent: 'TestAgent/1.0',
    documentHash: 'abc123hash',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'contract-1',
    memberId: 'member-1',
    memberName: 'Joao Silva',
    memberCPF: '52998224725',
    memberEmail: 'joao@email.com',
    plan: 'silver',
    signaturePreview: 'data:image/png;base64,iVBOR...',
    signedAt: '2026-01-01T00:00:00.000Z',
    ipAddress: '1.2.3.4',
    userAgent: 'TestAgent/1.0',
    documentHash: 'abc123hash',
    pdfUrl: '/contracts/member-1/contract.pdf',
    pdfPath: '/opt/clube/contracts/member-1/contract.pdf',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// =============================================================================
// uploadContractPDF
// =============================================================================

describe('uploadContractPDF', () => {
  it('should upload PDF via fetch and return url/path on success', async () => {
    mockedGetAccessToken.mockReturnValue('test-token')
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pdfUrl: '/contracts/file.pdf', pdfPath: '/opt/file.pdf' }),
    })

    const result = await uploadContractPDF('member-1', new Uint8Array([1, 2, 3]), '2026-01-01')

    expect(result).toEqual({ url: '/contracts/file.pdf', path: '/opt/file.pdf' })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('http://localhost:3001/contracts')
    expect(options.method).toBe('POST')
    expect(options.headers).toEqual({ Authorization: 'Bearer test-token' })
    expect(options.body).toBeInstanceOf(FormData)
  })

  it('should send empty headers when no access token', async () => {
    mockedGetAccessToken.mockReturnValue(null)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pdfUrl: '/url', pdfPath: '/path' }),
    })

    await uploadContractPDF('member-1', new Uint8Array([1]), '2026-01-01')

    const [, options] = mockFetch.mock.calls[0]
    expect(options.headers).toEqual({})
  })

  it('should return empty strings when upload fails (non-ok response)', async () => {
    mockedGetAccessToken.mockReturnValue('token')
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    const result = await uploadContractPDF('member-1', new Uint8Array([1]), '2026-01-01')

    expect(result).toEqual({ url: '', path: '' })
  })

  it('should return empty strings when fetch throws', async () => {
    mockedGetAccessToken.mockReturnValue('token')
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const result = await uploadContractPDF('member-1', new Uint8Array([1]), '2026-01-01')

    expect(result).toEqual({ url: '', path: '' })
  })

  it('should default missing pdfUrl/pdfPath to empty strings', async () => {
    mockedGetAccessToken.mockReturnValue('token')
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    })

    const result = await uploadContractPDF('member-1', new Uint8Array([1]), '2026-01-01')

    expect(result).toEqual({ url: '', path: '' })
  })
})

// =============================================================================
// saveContract
// =============================================================================

describe('saveContract', () => {
  it('should post contract data and return contract ID', async () => {
    mockedApi.post.mockResolvedValueOnce({
      data: { id: 'contract-123' },
      status: 201,
    })

    const contractData = makeContractData()
    const id = await saveContract(contractData, '/url', '/path')

    expect(id).toBe('contract-123')
    expect(mockedApi.post).toHaveBeenCalledWith('/contracts', {
      memberId: 'member-1',
      memberName: 'Joao Silva',
      memberCpf: '52998224725',
      memberEmail: 'joao@email.com',
      plan: 'silver',
      signaturePreview: contractData.signatureImage?.substring(0, 100),
      signedAt: '2026-01-01T00:00:00.000Z',
      ipAddress: '1.2.3.4',
      userAgent: 'TestAgent/1.0',
      documentHash: 'abc123hash',
    })
  })

  it('should throw when api returns error', async () => {
    mockedApi.post.mockResolvedValueOnce({
      error: 'Server error',
      status: 500,
    })

    await expect(saveContract(makeContractData(), '', '')).rejects.toThrow('Server error')
  })

  it('should throw when api returns no data', async () => {
    mockedApi.post.mockResolvedValueOnce({
      data: undefined,
      status: 200,
    })

    await expect(saveContract(makeContractData(), '', '')).rejects.toThrow('Resposta inválida ao salvar contrato')
  })

  it('should truncate signatureImage to 100 chars', async () => {
    const longSignature = 'X'.repeat(500)
    mockedApi.post.mockResolvedValueOnce({ data: { id: '1' }, status: 201 })

    await saveContract(makeContractData({ signatureImage: longSignature }), '', '')

    const call = mockedApi.post.mock.calls[0]
    expect(call[1]!.signaturePreview).toBe('X'.repeat(100))
  })
})

// =============================================================================
// getMemberContract
// =============================================================================

describe('getMemberContract', () => {
  it('should return contract when found', async () => {
    const contract = makeContract()
    mockedApi.get.mockResolvedValueOnce({ data: contract, status: 200 })

    const result = await getMemberContract('member-1')

    expect(result).toEqual(contract)
    expect(mockedApi.get).toHaveBeenCalledWith('/contracts/member-1')
  })

  it('should return null when no data', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: undefined, status: 404 })

    const result = await getMemberContract('member-1')

    expect(result).toBeNull()
  })
})

// =============================================================================
// getMemberContractHistory
// =============================================================================

describe('getMemberContractHistory', () => {
  it('should return array of contracts', async () => {
    const contracts = [makeContract({ id: 'c1' }), makeContract({ id: 'c2', status: 'superseded' })]
    mockedApi.get.mockResolvedValueOnce({ data: contracts, status: 200 })

    const result = await getMemberContractHistory('member-1')

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('c1')
    expect(result[1].status).toBe('superseded')
    expect(mockedApi.get).toHaveBeenCalledWith('/contracts/member-1/history')
  })

  it('should return empty array when no data', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: undefined, status: 404 })

    const result = await getMemberContractHistory('member-1')

    expect(result).toEqual([])
  })
})

// =============================================================================
// storeContract
// =============================================================================

describe('storeContract', () => {
  it('should upload contract and return contractId + pdfUrl', async () => {
    mockedGetAccessToken.mockReturnValue('test-token')
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: 'contract-99', pdfUrl: '/contracts/member-1.pdf' }),
    })

    const contractData = makeContractData()
    const result = await storeContract(contractData, new Uint8Array([1, 2, 3]))

    expect(result).toEqual({ contractId: 'contract-99', pdfUrl: '/contracts/member-1.pdf' })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('http://localhost:3001/contracts')
    expect(options.method).toBe('POST')
    expect(options.credentials).toBe('include')
    expect(options.body).toBeInstanceOf(FormData)
  })

  it('should retry with refreshed token on 401', async () => {
    mockedGetAccessToken
      .mockReturnValueOnce('old-token')
      .mockReturnValueOnce('new-token')
    mockedTryRefreshToken.mockResolvedValueOnce(true)

    // First call returns 401
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    })
    // Retry succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: 'contract-1', pdfUrl: '/url' }),
    })

    const result = await storeContract(makeContractData(), new Uint8Array([1]))

    expect(mockedTryRefreshToken).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(result.contractId).toBe('contract-1')
  })

  it('should throw when response is not ok after retry', async () => {
    mockedGetAccessToken.mockReturnValue('token')
    mockedTryRefreshToken.mockResolvedValueOnce(true)

    // First: 401
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
    // Retry: still fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal error' }),
    })

    await expect(storeContract(makeContractData(), new Uint8Array([1]))).rejects.toThrow('Internal error')
  })

  it('should throw when 401 and refresh fails', async () => {
    mockedGetAccessToken.mockReturnValue('token')
    mockedTryRefreshToken.mockResolvedValueOnce(false)

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    })

    await expect(storeContract(makeContractData(), new Uint8Array([1]))).rejects.toThrow(
      'Unauthorized'
    )
  })

  it('should throw with generic message when json parsing fails', async () => {
    mockedGetAccessToken.mockReturnValue('token')

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => { throw new Error('parse error') },
    })

    await expect(storeContract(makeContractData(), new Uint8Array([1]))).rejects.toThrow(
      'Erro ao salvar contrato (500)'
    )
  })

  it('should default missing id/pdfUrl to empty strings', async () => {
    mockedGetAccessToken.mockReturnValue('token')
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({}),
    })

    const result = await storeContract(makeContractData(), new Uint8Array([1]))

    expect(result).toEqual({ contractId: '', pdfUrl: '' })
  })

  it('should include signaturePreview only when signatureImage exists', async () => {
    mockedGetAccessToken.mockReturnValue('token')
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: '1', pdfUrl: '/url' }),
    })

    const contractData = makeContractData({ signatureImage: '' })
    await storeContract(contractData, new Uint8Array([1]))

    const formData = mockFetch.mock.calls[0][1].body as FormData
    expect(formData.has('signaturePreview')).toBe(false)
  })

  it('should append text fields before file in FormData', async () => {
    mockedGetAccessToken.mockReturnValue('token')
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: '1', pdfUrl: '/url' }),
    })

    await storeContract(makeContractData(), new Uint8Array([1]))

    const formData = mockFetch.mock.calls[0][1].body as FormData
    expect(formData.get('memberId')).toBe('member-1')
    expect(formData.get('memberName')).toBe('Joao Silva')
    expect(formData.get('plan')).toBe('silver')
    expect(formData.get('pdf')).toBeInstanceOf(Blob)
  })
})
