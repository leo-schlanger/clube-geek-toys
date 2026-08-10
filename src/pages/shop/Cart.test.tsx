import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockSetQuantity = vi.fn()
const mockRemoveItem = vi.fn()
const mockUseCart = vi.fn()

vi.mock('../../contexts/CartContext', () => ({
  useCart: () => mockUseCart(),
}))

vi.mock('../../components/store/useShopMember', () => ({
  useShopMember: () => ({ isMember: true, member: null, loading: false }),
}))

vi.mock('../../components/store/useWholesaleAccount', () => ({
  useWholesaleAccount: () => ({ isApproved: false }),
}))

vi.mock('../../components/store/ShopHeader', () => ({
  ShopHeader: () => <header data-testid="shop-header" />,
}))

vi.mock('../../components/store/MemberDiscountBadge', () => ({
  MemberDiscountBadge: () => <span>15% membro</span>,
}))

import Cart from './Cart'

describe('Cart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows empty state for retail cart', () => {
    mockUseCart.mockReturnValue({
      items: [],
      subtotal: 0,
      setQuantity: mockSetQuantity,
      removeItem: mockRemoveItem,
      channel: 'retail',
    })
    render(
      <MemoryRouter>
        <Cart />
      </MemoryRouter>
    )
    expect(screen.getByText('Meu carrinho')).toBeInTheDocument()
    expect(screen.getByText(/Seu carrinho está vazio/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ir às compras/i })).toHaveAttribute('href', '/')
  })

  it('shows empty wholesale cart copy', () => {
    mockUseCart.mockReturnValue({
      items: [],
      subtotal: 0,
      setQuantity: mockSetQuantity,
      removeItem: mockRemoveItem,
      channel: 'wholesale',
    })
    render(
      <MemoryRouter>
        <Cart />
      </MemoryRouter>
    )
    expect(screen.getByText('Carrinho atacado')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ir ao atacado/i })).toHaveAttribute('href', '/atacado')
  })

  it('lists items and allows qty/remove', () => {
    mockUseCart.mockReturnValue({
      items: [
        {
          productId: 'p1',
          variantId: null,
          variantLabel: null,
          name: 'Bolsa',
          slug: 'bolsa',
          price: 50,
          image: null,
          quantity: 2,
          stock: 10,
        },
      ],
      subtotal: 100,
      setQuantity: mockSetQuantity,
      removeItem: mockRemoveItem,
      channel: 'retail',
    })
    render(
      <MemoryRouter>
        <Cart />
      </MemoryRouter>
    )
    expect(screen.getByText('Bolsa')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Aumentar quantidade'))
    expect(mockSetQuantity).toHaveBeenCalledWith('p1', 3)
    fireEvent.click(screen.getByText(/Remover/i))
    expect(mockRemoveItem).toHaveBeenCalledWith('p1')
    expect(screen.getByRole('link', { name: /Finalizar compra/i })).toHaveAttribute(
      'href',
      '/checkout'
    )
  })

  it('shows member discount estimate when isMember', () => {
    mockUseCart.mockReturnValue({
      items: [
        {
          productId: 'p1',
          name: 'Item',
          slug: 'item',
          price: 100,
          image: null,
          quantity: 1,
          stock: 5,
        },
      ],
      subtotal: 100,
      setQuantity: mockSetQuantity,
      removeItem: mockRemoveItem,
      channel: 'retail',
    })
    render(
      <MemoryRouter>
        <Cart />
      </MemoryRouter>
    )
    // 15% of 100
    expect(screen.getByText(/15%/)).toBeInTheDocument()
  })
})
