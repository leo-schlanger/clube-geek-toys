import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const mockUseCart = vi.fn()
vi.mock('../../contexts/CartContext', () => ({
  useCart: () => mockUseCart(),
}))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}))

vi.mock('../../components/store/useShopMember', () => ({
  useShopMember: () => ({ isMember: false, member: null }),
}))

vi.mock('../../components/store/useShopChannel', () => ({
  useShopChannel: () => 'retail',
}))

vi.mock('../../components/store/useWholesaleAccount', () => ({
  useWholesaleAccount: () => ({ account: null, isApproved: false }),
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

vi.mock('../../components/StripePaymentForm', () => ({
  StripePaymentForm: () => <div data-testid="stripe-form" />,
}))

vi.mock('../../lib/reviews', () => ({
  getStoreCredit: vi.fn().mockResolvedValue({ balance: 0, rewardAmount: 1 }),
}))

vi.mock('../../lib/shipping', () => ({
  lookupCep: vi.fn(),
  quoteShipping: vi.fn(),
  maskCep: (v: string) => v.replace(/\D/g, '').replace(/(\d{5})(\d)/, '$1-$2'),
}))

vi.mock('../../lib/orders', () => ({
  createOrder: vi.fn(),
  cartToOrderItems: (items: unknown[]) => items,
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
  }),
}))

vi.mock('qrcode.react', () => ({
  QRCodeSVG: () => <svg data-testid="qr" />,
}))

import { lookupCep, quoteShipping } from '../../lib/shipping'
import { createOrder } from '../../lib/orders'
import ShopCheckout from './ShopCheckout'

const mockedLookup = vi.mocked(lookupCep)
const mockedQuote = vi.mocked(quoteShipping)
const mockedCreate = vi.mocked(createOrder)

const cartItem = {
  productId: 'p1',
  variantId: null,
  name: 'Bolsa',
  slug: 'bolsa',
  price: 100,
  image: null,
  quantity: 1,
  stock: 5,
}

describe('ShopCheckout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCart.mockReturnValue({
      items: [cartItem],
      subtotal: 100,
      channel: 'retail',
    })
    mockedLookup.mockResolvedValue({
      cep: '22011001',
      street: 'Rua Barata Ribeiro',
      neighborhood: 'Copacabana',
      city: 'Rio de Janeiro',
      state: 'RJ',
    })
    mockedQuote.mockResolvedValue({
      quoteToken: 'tok',
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      source: 'fallback',
      options: [
        {
          id: 'fallback-pac',
          name: 'PAC',
          company: 'Correios',
          price: 18,
          days: 5,
          service: 'PAC',
        },
      ],
      package: { weightG: 300, heightCm: 10, widthCm: 10, lengthCm: 10 },
    })
  })

  it('redirects to cart when empty', async () => {
    mockUseCart.mockReturnValue({ items: [], subtotal: 0, channel: 'retail' })
    render(
      <MemoryRouter>
        <ShopCheckout />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/carrinho', { replace: true })
    })
  })

  it('renders checkout form with items', () => {
    render(
      <MemoryRouter>
        <ShopCheckout />
      </MemoryRouter>
    )
    expect(screen.getByRole('heading', { name: /Finalizar compra/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/Nome completo/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/CEP/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Seus dados|Resumo/i).length).toBeGreaterThan(0)
  })



  it('fills address from CEP blur and quotes shipping', async () => {
    render(
      <MemoryRouter>
        <ShopCheckout />
      </MemoryRouter>
    )
    const cep = screen.getByLabelText(/CEP/i)
    fireEvent.change(cep, { target: { value: '22011001' } })
    fireEvent.blur(cep)
    await waitFor(() => {
      expect(mockedLookup).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(screen.getByDisplayValue(/Barata Ribeiro/i)).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(mockedQuote).toHaveBeenCalled()
    })
  })

  it('submits PIX order successfully', async () => {
    const user = userEvent.setup()
    mockedCreate.mockResolvedValue({
      order: {
        id: 'ord-1',
        orderNumber: 99,
        status: 'pending',
        total: 118,
      },
      pixData: {
        emvCode: '00020126PIXCODE',
        qrCodeBase64: null,
        txId: 'tx1',
      },
      clientSecret: null,
    } as never)

    render(
      <MemoryRouter>
        <ShopCheckout />
      </MemoryRouter>
    )

    await user.type(screen.getByLabelText(/Nome completo/i), 'Maria Silva')
    await user.type(screen.getByLabelText(/^Email/i), 'maria@test.com')
    const cep = screen.getByLabelText(/CEP/i)
    fireEvent.change(cep, { target: { value: '22011001' } })
    fireEvent.blur(cep)

    await waitFor(() => {
      expect(screen.getByDisplayValue(/Barata Ribeiro/i)).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(mockedQuote).toHaveBeenCalled()
    })

    await user.type(screen.getByLabelText(/^Número/i), '181')

    const submit = await waitFor(() => {
      const btn = screen
        .getAllByRole('button')
        .find((b) => b.getAttribute('type') === 'submit' && !(b as HTMLButtonElement).disabled)
      expect(btn).toBeTruthy()
      return btn!
    })
    await user.click(submit)

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(screen.getByTestId('qr')).toBeInTheDocument()
    })
  })
})

