import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('../../contexts/CartContext', () => ({
  useCart: () => ({ count: 0, items: [], subtotal: 0 }),
}))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}))

vi.mock('./useWholesaleAccount', () => ({
  useWholesaleAccount: () => ({ isApproved: false }),
}))

vi.mock('../../lib/reviews', () => ({
  getStoreCredit: vi.fn().mockResolvedValue({ balance: 0 }),
}))

vi.mock('../../data/event', () => ({
  isEventVisible: () => false,
}))

vi.mock('../ThemeToggle', () => ({
  ThemeToggle: () => null,
}))

vi.mock('./CartDrawer', () => ({
  CartDrawer: () => null,
}))

vi.mock('./MemberDiscountBadge', () => ({
  MemberDiscountBadge: () => null,
}))

import { ShopHeader } from './ShopHeader'

function renderHeader(props: { isWholesale?: boolean } = {}) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <ShopHeader {...props} />
    </MemoryRouter>
  )
}

describe('ShopHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Shopee-style search with Buscar control', () => {
    renderHeader()
    const inputs = screen.getAllByRole('searchbox', { name: /Buscar produtos/i })
    expect(inputs.length).toBeGreaterThan(0)
    // Desktop form exposes visible "Buscar" label; mobile uses icon-only aria-label
    expect(screen.getAllByRole('button', { name: /Pesquisar|Buscar/i }).length).toBeGreaterThan(0)
  })

  it('navigates to /?search= on submit', () => {
    renderHeader()
    const input = screen.getAllByRole('searchbox', { name: /Buscar produtos/i })[0]
    fireEvent.change(input, { target: { value: 'bolsa rosa' } })
    const form = input.closest('form')
    expect(form).toBeTruthy()
    fireEvent.submit(form!)
    expect(mockNavigate).toHaveBeenCalledWith('/?search=bolsa%20rosa')
  })

  it('clears search when empty submit', () => {
    renderHeader()
    const input = screen.getAllByRole('searchbox', { name: /Buscar produtos/i })[0]
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.submit(input.closest('form')!)
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('uses /atacado base when wholesale channel', () => {
    renderHeader({ isWholesale: true })
    const input = screen.getAllByRole('searchbox', { name: /Buscar produtos/i })[0]
    fireEvent.change(input, { target: { value: 'kit' } })
    fireEvent.submit(input.closest('form')!)
    expect(mockNavigate).toHaveBeenCalledWith('/atacado?search=kit')
  })

  it('keeps the current sort when searching', () => {
    render(
      <MemoryRouter initialEntries={['/?sort=price_asc']}>
        <ShopHeader />
      </MemoryRouter>
    )
    const input = screen.getAllByRole('searchbox', { name: /Buscar produtos/i })[0]
    fireEvent.change(input, { target: { value: 'photocard' } })
    fireEvent.submit(input.closest('form')!)
    expect(mockNavigate).toHaveBeenCalledWith('/?search=photocard&sort=price_asc')
  })
})
