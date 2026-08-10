import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { CartProvider, useCart } from './CartContext'

function wrap(path: string) {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="*"
          element={<CartProvider>{children}</CartProvider>}
        />
      </Routes>
    </MemoryRouter>
  )
}

const product = {
  id: 'p1',
  name: 'Item',
  slug: 'item',
  description: null,
  price: 20,
  compareAtPrice: null,
  categoryId: null,
  images: ['https://x.com/a.jpg'],
  stock: 10,
  sku: null,
  active: true,
  featured: false,
  wholesaleMinQty: 2,
  createdAt: '',
  updatedAt: '',
}

describe('CartContext', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('adds items and computes subtotal/count', () => {
    const { result } = renderHook(() => useCart(), { wrapper: wrap('/') })
    act(() => {
      result.current.addItem(product, 2)
    })
    expect(result.current.count).toBe(2)
    expect(result.current.subtotal).toBe(40)
    expect(result.current.channel).toBe('retail')
  })

  it('setQuantity and removeItem', () => {
    const { result } = renderHook(() => useCart(), { wrapper: wrap('/') })
    act(() => result.current.addItem(product, 1))
    act(() => result.current.setQuantity('p1', 5))
    expect(result.current.items[0].quantity).toBe(5)
    act(() => result.current.removeItem('p1'))
    expect(result.current.items).toHaveLength(0)
  })

  it('clear empties cart', () => {
    const { result } = renderHook(() => useCart(), { wrapper: wrap('/') })
    act(() => result.current.addItem(product, 1))
    act(() => result.current.clear())
    expect(result.current.count).toBe(0)
  })

  it('uses wholesale channel on /atacado', async () => {
    const { result } = renderHook(() => useCart(), { wrapper: wrap('/atacado') })
    await waitFor(() => expect(result.current.channel).toBe('wholesale'))
    act(() => result.current.addItem(product, 1))
    // min qty wholesale
    expect(result.current.items[0].quantity).toBeGreaterThanOrEqual(2)
  })

  it('throws outside provider', () => {
    expect(() => renderHook(() => useCart())).toThrow(/CartProvider/)
  })
})
