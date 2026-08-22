import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('../../lib/orders', () => ({
  getMyOrder: vi.fn(),
}))

vi.mock('../../lib/reviews', () => ({
  getStoreCredit: vi.fn(),
  listOrderReviews: vi.fn(),
}))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../../components/store/useShopMember', () => ({
  useShopMember: () => ({ isMember: true }),
}))

vi.mock('../../components/store/ShopHeader', () => ({
  ShopHeader: () => <header data-testid="shop-header" />,
}))

vi.mock('../../components/store/SeoHead', () => ({
  SeoHead: () => null,
}))

vi.mock('../../components/store/OrderReviewForm', () => ({
  OrderReviewForm: () => null,
}))

import { getMyOrder } from '../../lib/orders'
import { getStoreCredit, listOrderReviews } from '../../lib/reviews'
import { useAuth } from '../../contexts/AuthContext'
import MyOrderDetail from './MyOrderDetail'

const mockedGet = vi.mocked(getMyOrder)
const mockedReviews = vi.mocked(listOrderReviews)
const mockedCredit = vi.mocked(getStoreCredit)
const mockedAuth = vi.mocked(useAuth)

const order = {
  id: 'o1',
  orderNumber: 55,
  status: 'shipped' as const,
  total: 200,
  subtotal: 180,
  discount: 0,
  shippingCost: 20,
  trackingCode: 'BR123',
  trackingUrl: 'https://rastreio.example/BR123',
  customerName: 'Ana',
  customerEmail: 'a@b.com',
  items: [
    {
      id: 'i1',
      productId: 'p1',
      productName: 'Bolsa',
      quantity: 1,
      unitPrice: 180,
      lineTotal: 180,
      imageUrl: null,
    },
  ],
  shippingAddress: {
    street: 'Rua A',
    number: '1',
    neighborhood: 'Centro',
    city: 'Rio',
    state: 'RJ',
    cep: '22011001',
  },
  createdAt: '2026-08-01T12:00:00Z',
  updatedAt: '2026-08-02T12:00:00Z',
}

function renderDetail(id = 'o1') {
  return render(
    <MemoryRouter initialEntries={[`/minhas-compras/${id}`]}>
      <Routes>
        <Route path="/minhas-compras/:id" element={<MyOrderDetail />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('MyOrderDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedAuth.mockReturnValue({
      user: { id: 'u1', email: 'a@b.com', role: 'member' },
      loading: false,
    } as ReturnType<typeof useAuth>)
    mockedReviews.mockResolvedValue([])
    mockedCredit.mockResolvedValue({ balance: 0, rewardAmount: 1 })
  })

  it('redirects unauthenticated users', async () => {
    mockedAuth.mockReturnValue({
      user: null,
      loading: false,
    } as ReturnType<typeof useAuth>)
    renderDetail()
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/entrar?next=/minhas-compras/o1', {
        replace: true,
      })
    })
  })

  it('shows order not found', async () => {
    mockedGet.mockResolvedValue(null)
    renderDetail()
    await waitFor(() => {
      expect(screen.getByText(/Pedido não encontrado/i)).toBeInTheDocument()
    })
  })

  it('renders order detail with tracking', async () => {
    mockedGet.mockResolvedValue(order as never)
    renderDetail()
    await waitFor(() => {
      expect(screen.getByText(/Pedido #55/i)).toBeInTheDocument()
    })
    expect(screen.getByText('Bolsa')).toBeInTheDocument()
    expect(screen.getByText(/BR123/)).toBeInTheDocument()
    expect(screen.getByText(/Acompanhamento/i)).toBeInTheDocument()
  })

  /**
   * Pickup reuses the same shipping statuses, but "on the way" / "delivered"
   * mean nothing to someone collecting at the counter — and the address on
   * screen must be the store, not a delivery destination that never existed.
   */
  it('reads a pickup order as counter collection, not delivery', async () => {
    mockedGet.mockResolvedValue({
      ...order,
      deliveryMethod: 'pickup',
      shippingCost: 0,
      shippingService: 'Retirada na loja',
      trackingCode: null,
      trackingUrl: null,
      total: 180,
    } as never)
    renderDetail()

    await waitFor(() => {
      expect(screen.getByText(/Pedido #55/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/Pronto para retirada/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Retirada na loja/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Rua Barata Ribeiro, 181/i)).toBeInTheDocument()
    expect(screen.getByText(/Grátis/i)).toBeInTheDocument()
    // No "A caminho" copy and no Correios tracking.
    expect(screen.queryByText(/A caminho/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Rastrear nos Correios/i)).not.toBeInTheDocument()
  })
})
