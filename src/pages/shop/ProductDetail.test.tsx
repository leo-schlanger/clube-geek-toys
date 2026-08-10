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

vi.mock('../../components/store/VariantPicker', () => ({
  VariantPicker: () => null,
  matchVariant: () => null,
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { getProductBySlug, listRelatedProducts } from '../../lib/products'
import { toast } from 'sonner'
import ProductDetail from './ProductDetail'

const mockedGet = vi.mocked(getProductBySlug)
const mockedRelated = vi.mocked(listRelatedProducts)

const product = {
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
})
