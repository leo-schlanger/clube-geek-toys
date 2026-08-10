import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const mockClear = vi.fn()

vi.mock('../../lib/orders', () => ({
  getOrderStatus: vi.fn(),
}))

vi.mock('../../contexts/CartContext', () => ({
  useCart: () => ({ clear: mockClear }),
}))

vi.mock('../../components/store/useShopMember', () => ({
  useShopMember: () => ({ isMember: false }),
}))

vi.mock('../../components/store/ShopHeader', () => ({
  ShopHeader: () => <header data-testid="shop-header" />,
}))

import { getOrderStatus } from '../../lib/orders'
import OrderConfirmation from './OrderConfirmation'

const mockedStatus = vi.mocked(getOrderStatus)

function renderPage(id = 'ord-1') {
  return render(
    <MemoryRouter initialEntries={[`/pedido/${id}`]}>
      <Routes>
        <Route path="/pedido/:id" element={<OrderConfirmation />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('OrderConfirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows not found when API returns null', async () => {
    mockedStatus.mockResolvedValue(null)
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Pedido não encontrado/i)).toBeInTheDocument()
    })
  })

  it('shows paid confirmation and clears cart', async () => {
    mockedStatus.mockResolvedValue({
      id: 'ord-1',
      status: 'paid',
      orderNumber: 42,
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Pagamento confirmado/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/#42|#\s*42/i)).toBeTruthy()
    expect(mockClear).toHaveBeenCalled()
  })

  it('shows pending payment state', async () => {
    mockedStatus.mockResolvedValue({
      id: 'ord-1',
      status: 'pending',
      orderNumber: 7,
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Aguardando pagamento/i)).toBeInTheDocument()
    })
    expect(mockClear).not.toHaveBeenCalled()
  })

  it('shows cancelled state', async () => {
    mockedStatus.mockResolvedValue({
      id: 'ord-1',
      status: 'cancelled',
      orderNumber: 3,
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Pedido cancelado/i)).toBeInTheDocument()
    })
  })
})
