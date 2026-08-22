import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../../lib/wholesale', () => ({
  getWholesaleSalesOpen: vi.fn(),
}))

import { getWholesaleSalesOpen } from '../../lib/wholesale'
import { useWholesaleSalesOpen, resetWholesaleSalesOpenCache } from './useWholesaleSalesOpen'

const mockedGet = vi.mocked(getWholesaleSalesOpen)

describe('useWholesaleSalesOpen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetWholesaleSalesOpenCache()
  })

  it('reads the open channel', async () => {
    mockedGet.mockResolvedValue(true)
    const { result } = renderHook(() => useWholesaleSalesOpen())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.salesOpen).toBe(true)
  })

  // Um erro de rede não pode virar botão de compra que a API vai recusar.
  it('trata falha como canal fechado', async () => {
    mockedGet.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useWholesaleSalesOpen())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.salesOpen).toBe(false)
  })

  it('compartilha uma requisição entre as telas do canal', async () => {
    mockedGet.mockResolvedValue(true)
    const first = renderHook(() => useWholesaleSalesOpen())
    const second = renderHook(() => useWholesaleSalesOpen())
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    await waitFor(() => expect(second.result.current.loading).toBe(false))
    expect(mockedGet).toHaveBeenCalledTimes(1)
  })

  it('não consulta a API no varejo', async () => {
    const { result } = renderHook(() => useWholesaleSalesOpen(false))
    expect(result.current.loading).toBe(false)
    expect(result.current.salesOpen).toBe(false)
    expect(mockedGet).not.toHaveBeenCalled()
  })
})
