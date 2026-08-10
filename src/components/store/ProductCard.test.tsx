import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const addItem = vi.fn()

vi.mock('../../contexts/CartContext', () => ({
  useCart: () => ({ addItem, items: [], count: 0, subtotal: 0, channel: 'retail', removeItem: vi.fn(), setQuantity: vi.fn(), clear: vi.fn() }),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

import { ProductCard } from './ProductCard'
import { toast } from 'sonner'

const product = {
  id: 'p1',
  name: 'Photocard X',
  slug: 'photocard-x',
  description: null,
  price: 100,
  compareAtPrice: 120,
  categoryId: null,
  categoryName: 'Música',
  images: ['https://example.com/a.jpg'],
  stock: 10,
  sku: 'SKU1',
  active: true,
  featured: true,
  wholesaleEnabled: true,
  wholesaleMinQty: 3,
  createdAt: '',
  updatedAt: '',
}

describe('ProductCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders product and member preview', () => {
    render(
      <MemoryRouter>
        <ProductCard product={product} isMember />
      </MemoryRouter>
    )
    expect(screen.getByText('Photocard X')).toBeInTheDocument()
    expect(screen.getByText(/Membro/i)).toBeInTheDocument()
  })

  it('adds to cart on button click', () => {
    render(
      <MemoryRouter>
        <ProductCard product={product} />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByRole('button', { name: /Adicionar/i }))
    expect(addItem).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalled()
  })

  it('wholesale mode uses atacado path and min qty', () => {
    render(
      <MemoryRouter>
        <ProductCard product={product} isWholesale isWholesaleApproved />
      </MemoryRouter>
    )
    const link = screen.getAllByRole('link')[0]
    expect(link.getAttribute('href')).toContain('/atacado/produto/')
    fireEvent.click(screen.getByRole('button', { name: /Adicionar/i }))
    expect(addItem).toHaveBeenCalledWith(product, 3)
  })

  it('shows esgotado when stock 0', () => {
    render(
      <MemoryRouter>
        <ProductCard product={{ ...product, stock: 0 }} />
      </MemoryRouter>
    )
    expect(screen.getAllByText(/Esgotado/i).length).toBeGreaterThan(0)
  })
})
