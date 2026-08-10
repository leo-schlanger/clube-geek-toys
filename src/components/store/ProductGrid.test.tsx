import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../contexts/CartContext', () => ({
  useCart: () => ({
    addItem: vi.fn(),
    items: [],
    count: 0,
    subtotal: 0,
    channel: 'retail',
    removeItem: vi.fn(),
    setQuantity: vi.fn(),
    clear: vi.fn(),
  }),
}))

import { ProductGrid } from './ProductGrid'

const product = {
  id: 'p1',
  name: 'Item A',
  slug: 'item-a',
  description: null,
  price: 10,
  compareAtPrice: null,
  categoryId: null,
  images: [],
  stock: 1,
  sku: null,
  active: true,
  featured: false,
  createdAt: '',
  updatedAt: '',
}

describe('ProductGrid', () => {
  it('shows skeleton when loading', () => {
    const { container } = render(
      <MemoryRouter>
        <ProductGrid products={[]} loading />
      </MemoryRouter>
    )
    expect(container.querySelectorAll('[class*="animate-pulse"], .h-4').length).toBeGreaterThan(0)
  })

  it('shows empty message', () => {
    render(
      <MemoryRouter>
        <ProductGrid products={[]} emptyMessage="Vazio custom" />
      </MemoryRouter>
    )
    expect(screen.getByText('Vazio custom')).toBeInTheDocument()
  })

  it('renders products', () => {
    render(
      <MemoryRouter>
        <ProductGrid products={[product]} isWholesale />
      </MemoryRouter>
    )
    expect(screen.getByText('Item A')).toBeInTheDocument()
  })
})
