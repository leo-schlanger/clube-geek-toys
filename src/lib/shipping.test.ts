import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

import { api } from './api-client'
import { lookupCep, quoteShipping, maskCep } from './shipping'

const mockedApi = vi.mocked(api)

describe('shipping', () => {
  beforeEach(() => vi.clearAllMocks())

  it('maskCep formats CEP', () => {
    expect(maskCep('22011')).toBe('22011')
    expect(maskCep('22011001')).toBe('22011-001')
    expect(maskCep('22011-001')).toBe('22011-001')
  })

  it('lookupCep cleans digits and returns data', async () => {
    mockedApi.get.mockResolvedValue({
      data: {
        cep: '22011001',
        street: 'Rua',
        neighborhood: 'Cop',
        city: 'Rio',
        state: 'RJ',
      },
      status: 200,
    })
    const res = await lookupCep('22011-001')
    expect(mockedApi.get).toHaveBeenCalledWith('/shipping/cep/22011001', { skipAuth: true })
    expect(res.city).toBe('Rio')
  })

  it('lookupCep throws', async () => {
    mockedApi.get.mockResolvedValue({ error: 'não encontrado', status: 404 })
    await expect(lookupCep('00000000')).rejects.toThrow()
  })

  it('quoteShipping posts cart', async () => {
    mockedApi.post.mockResolvedValue({
      data: {
        quoteToken: 'tok',
        expiresAt: '',
        options: [],
        package: { weightG: 300, heightCm: 1, widthCm: 1, lengthCm: 1 },
        source: 'fallback',
      },
      status: 200,
    })
    const res = await quoteShipping('22011001', [{ productId: 'p1', quantity: 1 }])
    expect(res.source).toBe('fallback')
  })

  it('quoteShipping throws', async () => {
    mockedApi.post.mockResolvedValue({ error: 'erro', status: 400 })
    await expect(quoteShipping('22011001', [])).rejects.toThrow()
  })
})
