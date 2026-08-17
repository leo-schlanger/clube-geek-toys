import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const mockAddItem = vi.fn()
const mockNavigate = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('../../lib/products', () => ({
  getProductBySlug: vi.fn(),
  listRelatedProducts: vi.fn(),
}))

vi.mock('../../contexts/CartContext', () => ({
  useCart: () => ({ addItem: mockAddItem }),
}))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}))

vi.mock('../../components/store/useShopMember', () => ({
  useShopMember: () => ({ isMember: false }),
}))

vi.mock('../../components/store/useShopChannel', () => ({
  useShopChannel: () => 'retail',
}))

vi.mock('../../components/store/useWholesaleAccount', () => ({
  useWholesaleAccount: () => ({ isApproved: false }),
}))

vi.mock('../../components/store/ShopHeader', () => ({
  ShopHeader: () => <header data-testid="shop-header" />,
}))

vi.mock('../../components/store/SeoHead', () => ({
  SeoHead: () => null,
}))

vi.mock('../../components/store/MemberDiscountBadge', () => ({
  MemberDiscountBadge: () => null,
}))

vi.mock('../../components/store/PaymentTrustBadges', () => ({
  PaymentTrustBadges: () => null,
}))

vi.mock('../../components/store/ProductReviews', () => ({
  ProductReviews: () => null,
}))

vi.mock('../../components/store/ProductGrid', () => ({
  ProductGrid: () => null,
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { getProductBySlug, listRelatedProducts } from '../../lib/products'
import { toast } from 'sonner'
import ProductDetail from './ProductDetail'
import type { Product } from '../../types'

const mockedGet = vi.mocked(getProductBySlug)
const mockedRelated = vi.mocked(listRelatedProducts)

const product: Product = {
  id: 'p1',
  name: 'Bolsa jeans',
  slug: 'bolsa-jeans',
  description: 'Y2K bag',
  price: 125.9,
  compareAtPrice: null,
  categoryId: null,
  categoryName: 'Acessório',
  images: ['https://example.com/a.jpg'],
  stock: 10,
  sku: 'BJ-1',
  active: true,
  featured: false,
  hasVariants: false,
  createdAt: '',
  updatedAt: '',
}

const productWithVariants: Product = {
  ...product,
  id: 'p2',
  name: 'Bolsa colorida',
  slug: 'bolsa-colorida',
  images: ['https://example.com/listing.jpg'],
  hasVariants: true,
  variantAxes: [{ name: 'Cor', options: ['Rosa', 'Preto'] }],
  variants: [
    {
      id: 'v-rosa',
      productId: 'p2',
      name: 'Rosa',
      options: { Cor: 'Rosa' },
      sku: 'BR',
      price: 100,
      compareAtPrice: null,
      stock: 5,
      images: ['https://example.com/rosa.jpg'],
      active: true,
      sortOrder: 0,
    },
    {
      id: 'v-preto',
      productId: 'p2',
      name: 'Preto',
      options: { Cor: 'Preto' },
      sku: 'BP',
      price: 110,
      compareAtPrice: null,
      stock: 3,
      images: ['https://example.com/preto.jpg'],
      active: true,
      sortOrder: 1,
    },
  ],
}

function renderPdp(slug = 'bolsa-jeans') {
  return render(
    <MemoryRouter initialEntries={[`/produto/${slug}`]}>
      <Routes>
        <Route path="/produto/:slug" element={<ProductDetail />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ProductDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedRelated.mockResolvedValue([])
  })

  it('shows not found when product missing', async () => {
    mockedGet.mockResolvedValue(null)
    renderPdp('missing')
    await waitFor(() => {
      expect(screen.getByText(/Produto não encontrado/i)).toBeInTheDocument()
    })
  })

  it('loads product and adds to cart', async () => {
    mockedGet.mockResolvedValue(product)
    renderPdp()
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Bolsa jeans' })).toBeInTheDocument()
    })
    expect(screen.getByText(/Acessório/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Adicionar ao carrinho|Adicionar/i }))
    expect(mockAddItem).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalled()
  })

  it('handles load error as not found', async () => {
    mockedGet.mockRejectedValue(new Error('network'))
    renderPdp()
    await waitFor(() => {
      expect(screen.getByText(/Produto não encontrado/i)).toBeInTheDocument()
    })
  })

  it('swaps main gallery image when selecting a variant with its own photo', async () => {
    mockedGet.mockResolvedValue(productWithVariants)
    renderPdp('bolsa-colorida')
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Bolsa colorida' })).toBeInTheDocument()
    })

    // Preselects the first option, showing that variant's gallery
    const main = screen.getByRole('img', { name: /Bolsa colorida/i })
    expect(main.getAttribute('src')).toBe('https://example.com/rosa.jpg')

    fireEvent.click(screen.getByRole('button', { name: /Preto/i }))
    await waitFor(() => {
      const after = screen.getByRole('img', { name: /Bolsa colorida/i })
      expect(after.getAttribute('src')).toBe('https://example.com/preto.jpg')
    })
  })

  it('disables add-to-cart when variation selection is cleared', async () => {
    mockedGet.mockResolvedValue(productWithVariants)
    renderPdp('bolsa-colorida')
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Bolsa colorida' })).toBeInTheDocument()
    })
    // Toggling it off leaves no match, so the button is disabled
    fireEvent.click(screen.getByRole('button', { name: /Rosa/i }))
    const addBtn = screen.getByRole('button', { name: /Esgotado|Adicionar/i })
    expect(addBtn).toBeDisabled()
    expect(mockAddItem).not.toHaveBeenCalled()
  })

  it('adds selected variant to cart', async () => {
    mockedGet.mockResolvedValue(productWithVariants)
    renderPdp('bolsa-colorida')
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Bolsa colorida' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Preto/i }))
    fireEvent.click(screen.getByRole('button', { name: /Adicionar ao carrinho|Adicionar/i }))
    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'bolsa-colorida' }),
      1,
      expect.objectContaining({ id: 'v-preto', name: 'Preto' })
    )
  })
})
