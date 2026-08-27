import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// The promotion arrives from the API. These tests predate it and are about the
// basket, the address and the shipping quote, so it is switched off here; the
// promotion has its own tests in lib/shop-discount.test.ts.
vi.mock('../../hooks/useShopPromo', () => ({
  useShopPromo: () => ({
    promo: { enabled: false, percent: 0, bannerEnabled: false, bannerText: '' },
    loading: false,
  }),
}))

vi.mock('../../contexts/CartContext', () => ({
  useCart: () => ({
    items: [],
    count: 0,
    subtotal: 0,
    channel: 'wholesale',
    setQuantity: vi.fn(),
    removeItem: vi.fn(),
    addItem: vi.fn(),
    clear: vi.fn(),
  }),
}))

import { CartDrawer } from './CartDrawer'

describe('CartDrawer', () => {
  it('shows empty cart state', () => {
    render(
      <MemoryRouter>
        <CartDrawer open onOpenChange={() => {}} isWholesaleApproved />
      </MemoryRouter>
    )
    expect(screen.getByText(/carrinho está vazio/i)).toBeInTheDocument()
  })
})
