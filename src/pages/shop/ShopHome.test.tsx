import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('../../lib/products', () => ({
  listProducts: vi.fn(),
  listCategories: vi.fn(),
}))

vi.mock('../../components/store/useShopMember', () => ({
  useShopMember: () => ({ isMember: false, member: null, loading: false }),
}))

vi.mock('../../components/store/ShopHeader', () => ({
  ShopHeader: () => <header data-testid="shop-header">Header</header>,
}))

vi.mock('../../components/store/ProductGrid', () => ({
  ProductGrid: ({ products }: { products: { name: string }[] }) => (
    <div data-testid="grid">{products.map((p) => p.name).join(', ')}</div>
  ),
}))

vi.mock('../../components/store/CategoryNav', () => ({
  CategoryNav: () => <nav data-testid="cats">Cats</nav>,
}))

vi.mock('../../components/store/EventPromoCard', () => ({
  EventPromoCard: () => <div data-testid="event-promo">Evento</div>,
}))

vi.mock('../../components/store/SeoHead', () => ({
  SeoHead: () => null,
  SHOP_DEFAULT_SEO: { title: 'Loja', description: 'desc' },
}))

vi.mock('../../components/store/PaymentTrustBadges', () => ({
  PaymentTrustBadges: () => null,
}))

vi.mock('../../data/event', () => ({
  isEventVisible: () => true,
}))

import { listProducts, listCategories } from '../../lib/products'
import ShopHome from './ShopHome'

const mockedList = vi.mocked(listProducts)
const mockedCats = vi.mocked(listCategories)

const sampleProduct = {
  id: 'p1',
  name: 'Photocard BTS',
  slug: 'pc-bts',
  description: null,
  price: 99.9,
  compareAtPrice: null,
  categoryId: null,
  images: [],
  stock: 5,
  sku: null,
  active: true,
  featured: true,
  createdAt: '',
  updatedAt: '',
}

function renderHome(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<ShopHome />} />
        <Route path="/categoria/:slug" element={<ShopHome />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ShopHome', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedCats.mockResolvedValue([
      {
        id: 'c1',
        name: 'Música',
        slug: 'musica',
        description: null,
        active: true,
        sortOrder: 0,
        createdAt: '',
        updatedAt: '',
      },
    ])
    mockedList.mockResolvedValue({ products: [sampleProduct], total: 1, page: 1, limit: 48 })
  })

  it('renders hero and product grid on home', async () => {
    renderHome('/')
    expect(screen.getByTestId('shop-header')).toBeInTheDocument()
    expect(screen.getByText(/Photocards, Merch e Cultura Geek e Kpop/i)).toBeInTheDocument()
    await waitFor(() => {
      const grids = screen.getAllByTestId('grid')
      expect(grids.some((g) => g.textContent?.includes('Photocard BTS'))).toBe(true)
    })
    expect(mockedList).toHaveBeenCalled()
  })


  it('loads products for category slug', async () => {
    renderHome('/categoria/musica')
    await waitFor(() => {
      expect(mockedList).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'musica', limit: 48 })
      )
    })
    await waitFor(() => {
      expect(screen.getByText('Música')).toBeInTheDocument()
    })
  })

  it('shows search heading from query string', async () => {
    renderHome('/?search=bts')
    await waitFor(() => {
      expect(screen.getByText(/Resultados para "bts"/i)).toBeInTheDocument()
    })
    expect(mockedList).toHaveBeenCalledWith(expect.objectContaining({ search: 'bts' }))
  })

  it('handles empty catalog', async () => {
    mockedList.mockResolvedValue({ products: [], total: 0, page: 1, limit: 48 })
    renderHome('/')
    await waitFor(() => {
      expect(mockedList).toHaveBeenCalled()
    })
    expect(screen.getByText(/Todos os produtos/i)).toBeInTheDocument()
  })
})
