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

/**
 * `fromCheckout` is the state the checkout attaches when it forwards here. The
 * same URL is also the public order page linked from the confirmation e-mail,
 * and that visit must not touch the cart — hence the flag rather than "always
 * clear on a paid order".
 */
function renderPage(id = 'ord-1', fromCheckout = true) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: `/pedido/${id}`, state: fromCheckout ? { fromCheckout: true } : null }]}
    >
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

  it('leaves the cart alone when the page is opened from the e-mail link', async () => {
    mockedStatus.mockResolvedValue({
      id: 'ord-1',
      status: 'paid',
      orderNumber: 42,
    })
    renderPage('ord-1', false)
    await waitFor(() => {
      expect(screen.getByText(/Pagamento confirmado/i)).toBeInTheDocument()
    })
    // Days later, with a new cart in progress: emptying it here would be a
    // silent loss the customer never asked for.
    expect(mockClear).not.toHaveBeenCalled()
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
