import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('../../lib/orders', () => ({
  listMyOrders: vi.fn(),
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

import { listMyOrders } from '../../lib/orders'
import { useAuth } from '../../contexts/AuthContext'
import MyOrders from './MyOrders'

const mockedList = vi.mocked(listMyOrders)
const mockedAuth = vi.mocked(useAuth)

describe('MyOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedAuth.mockReturnValue({
      user: { id: 'u1', email: 'a@b.com', role: 'member' },
      loading: false,
    } as ReturnType<typeof useAuth>)
  })

  it('redirects guests to login', async () => {
    mockedAuth.mockReturnValue({
      user: null,
      loading: false,
    } as ReturnType<typeof useAuth>)
    render(
      <MemoryRouter>
        <MyOrders />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/entrar?next=/minhas-compras', { replace: true })
    })
  })

  it('shows empty state', async () => {
    mockedList.mockResolvedValue({ orders: [], total: 0, page: 1, limit: 40 })
    render(
      <MemoryRouter>
        <MyOrders />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(screen.getByText(/Nenhum pedido nesta aba/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: /Minhas compras/i })).toBeInTheDocument()
  })

  it('lists orders and switches tabs', async () => {
    mockedList.mockResolvedValue({
      orders: [
        {
          id: 'o1',
          orderNumber: 101,
          status: 'paid',
          total: 150,
          items: [{ productName: 'Bolsa', imageUrl: null }],
          createdAt: '2026-08-01T12:00:00Z',
        } as never,
      ],
      total: 1,
      page: 1,
      limit: 40,
    })
    render(
      <MemoryRouter>
        <MyOrders />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(screen.getByText(/#101|Pedido #101/i)).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'A pagar' }))
    await waitFor(() => {
      expect(mockedList).toHaveBeenCalledWith(expect.objectContaining({ tab: 'to_pay' }))
    })
  })
})
