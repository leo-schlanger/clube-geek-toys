import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../lib/products', () => ({
  listProducts: vi.fn(),
  listCategories: vi.fn(),
}))

vi.mock('../../components/store/useWholesaleAccount', () => ({
  useWholesaleAccount: vi.fn(),
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
  CategoryNav: () => null,
}))

vi.mock('../../components/store/SeoHead', () => ({
  SeoHead: () => null,
}))

import { listProducts, listCategories } from '../../lib/products'
import { useWholesaleAccount } from '../../components/store/useWholesaleAccount'
import WholesaleHome from './WholesaleHome'

const mockedList = vi.mocked(listProducts)
const mockedCats = vi.mocked(listCategories)
const mockedWh = vi.mocked(useWholesaleAccount)

describe('WholesaleHome', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedCats.mockResolvedValue([])
    mockedWh.mockReturnValue({
      account: null,
      isApproved: false,
      isPending: false,
      loading: false,
    })
  })

  it('shows empty catalog preparation message', async () => {
    mockedList.mockResolvedValue({ products: [], total: 0, page: 1, limit: 48 })
    render(
      <MemoryRouter>
        <WholesaleHome />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(screen.getByText(/Catálogo atacado em preparação/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/Atacado B2B/i)).toBeInTheDocument()
    expect(mockedList).toHaveBeenCalledWith(expect.objectContaining({ wholesale: true }))
  })

  it('lists wholesale products when available', async () => {
    mockedList.mockResolvedValue({
      products: [
        {
          id: 'p1',
          name: 'Lote Cards',
          slug: 'lote',
          description: null,
          price: 50,
          compareAtPrice: null,
          categoryId: null,
          images: [],
          stock: 20,
          sku: null,
          active: true,
          featured: false,
          wholesaleEnabled: true,
          createdAt: '',
          updatedAt: '',
        },
      ],
      total: 1,
      page: 1,
      limit: 48,
    })
    mockedWh.mockReturnValue({
      account: {
        id: 'w1',
        userId: 'u1',
        cnpj: '11222333000181',
        companyName: 'Co',
        tradeName: null,
        stateRegistration: null,
        phone: null,
        contactName: 'A',
        businessActivity: null,
        status: 'approved',
        rejectionReason: null,
        reviewedBy: null,
        reviewedAt: null,
        adminNotes: null,
        createdAt: '',
        updatedAt: '',
      },
      isApproved: true,
      isPending: false,
      loading: false,
    })
    render(
      <MemoryRouter>
        <WholesaleHome />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(screen.getByTestId('grid')).toHaveTextContent('Lote Cards')
    })
  })
})
