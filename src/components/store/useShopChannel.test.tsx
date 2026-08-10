import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useShopChannel, isWholesalePath } from './useShopChannel'

function wrap(path: string) {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<>{children}</>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('useShopChannel', () => {
  it('detects retail', () => {
    const { result } = renderHook(() => useShopChannel(), { wrapper: wrap('/') })
    expect(result.current).toBe('retail')
  })

  it('detects wholesale', () => {
    const { result } = renderHook(() => useShopChannel(), {
      wrapper: wrap('/atacado/checkout'),
    })
    expect(result.current).toBe('wholesale')
  })

  it('isWholesalePath helper', () => {
    expect(isWholesalePath('/atacado')).toBe(true)
    expect(isWholesalePath('/carrinho')).toBe(false)
  })
})
