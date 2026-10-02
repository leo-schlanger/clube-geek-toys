import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const mockNavigate = vi.fn()
// The promotion arrives from the API. These tests predate it and are about the
// basket, the address and the shipping quote, so it is switched off here; the
// promotion has its own tests in lib/shop-discount.test.ts.
vi.mock('../../hooks/useShopPromo', () => ({
  useShopPromo: () => ({
    promo: { enabled: false, percent: 0, bannerEnabled: false, bannerText: '' },
    loading: false,
  }),
}))

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

vi.mock('../../components/PagarmeCardForm', () => ({
  PagarmeCardForm: (props: { onCancel?: () => void; onSwitchToPix?: () => void }) => (
    <div data-testid="card-form">
      <button type="button" onClick={props.onCancel}>
        mock-voltar
      </button>
      <button type="button" onClick={props.onSwitchToPix}>
        mock-pix
      </button>
    </div>
  ),
}))

vi.mock('../../lib/reviews', () => ({
  getStoreCredit: vi.fn().mockResolvedValue({ balance: 0, rewardAmount: 1 }),
}))

vi.mock('../../lib/shipping', () => ({
  lookupCep: vi.fn(),
  quoteShipping: vi.fn(),
  maskCep: (v: string) => v.replace(/\D/g, '').replace(/(\d{5})(\d)/, '$1-$2'),
  STORE_PICKUP: {
    name: 'GeekPop & Toys',
    address: 'Rua Barata Ribeiro, 181, Loja J — Copacabana, Rio de Janeiro/RJ',
    cep: '22011-001',
    hours: 'Segunda a sábado, 10h às 19h',
    mapsUrl: 'https://maps.google.com/?q=loja',
  },
  PICKUP_SERVICE_LABEL: 'Retirada na loja',
}))

vi.mock('../../lib/orders', () => ({
  createOrder: vi.fn(),
  payOrderWithCard: vi.fn(),
  abandonCardOrder: vi.fn(async () => {}),
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
import { abandonCardOrder, createOrder } from '../../lib/orders'
import ShopCheckout from './ShopCheckout'

const mockedLookup = vi.mocked(lookupCep)
const mockedQuote = vi.mocked(quoteShipping)
const mockedCreate = vi.mocked(createOrder)
const mockedAbandon = vi.mocked(abandonCardOrder)

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
        qrCodeUrl: 'https://api.pagar.me/qr/ch_1.png',
        txId: 'ch_1',
        provider: 'pagarme',
      },
    } as never)

    render(
      <MemoryRouter>
        <ShopCheckout />
      </MemoryRouter>
    )

    await user.type(screen.getByLabelText(/Nome completo/i), 'Maria Silva')
    await user.type(screen.getByLabelText(/^Email/i), 'maria@test.com')
    // The acquirer refuses an order with no buyer document, so the field is
    // required and the checkout checks the digits before submitting.
    await user.type(screen.getByLabelText(/^CPF/i), '52998224725')
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

  /**
   * Pickup is the path where the customer never types an address or picks
   * shipping. What these tests pin, in cost-if-broken order:
   *
   *  1. Choosing pickup unmounts the address fields — if they stayed mounted
   *     and hidden, `required` would block form submit.
   *  2. The order leaves without `shippingAddress` or `shipping`, with
   *     `deliveryMethod: 'pickup'`.
   *  3. The summary shows free shipping, not an endless "Calcular".
   */
  describe('retirada na loja', () => {
    it('hides address and shipping fields when pickup is chosen', async () => {
      const user = userEvent.setup()
      render(
        <MemoryRouter>
          <ShopCheckout />
        </MemoryRouter>
      )

      expect(screen.getByLabelText(/CEP/i)).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /Retirar na loja/i }))

      expect(screen.queryByLabelText(/CEP/i)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/^Número/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Frete \(Correios\)/i)).not.toBeInTheDocument()
      expect(screen.getAllByText(/Rua Barata Ribeiro, 181/i).length).toBeGreaterThan(0)
    })

    it('shows shipping as free in the summary', async () => {
      const user = userEvent.setup()
      render(
        <MemoryRouter>
          <ShopCheckout />
        </MemoryRouter>
      )
      await user.click(screen.getByRole('button', { name: /Retirar na loja/i }))

      expect(screen.getAllByText(/Grátis/i).length).toBeGreaterThan(0)
      // Estimated total is goods only, no shipping added.
      expect(screen.getByRole('button', { name: /Continuar · R\$\s*100,00/i })).toBeInTheDocument()
    })

    it('creates the order with deliveryMethod pickup and no address or quote', async () => {
      const user = userEvent.setup()
      mockedCreate.mockResolvedValue({
        order: { id: 'ord-2', orderNumber: 100, status: 'pending', total: 100 },
        pixData: { emvCode: '00020126PIXCODE', txId: 'ch_2', provider: 'pagarme' },
      } as never)

      render(
        <MemoryRouter>
          <ShopCheckout />
        </MemoryRouter>
      )

      await user.type(screen.getByLabelText(/Nome completo/i), 'Maria Silva')
      await user.type(screen.getByLabelText(/^Email/i), 'maria@test.com')
      await user.type(screen.getByLabelText(/^CPF/i), '52998224725')
      await user.click(screen.getByRole('button', { name: /Retirar na loja/i }))

      const submit = screen
        .getAllByRole('button')
        .find((b) => b.getAttribute('type') === 'submit') as HTMLButtonElement
      expect(submit.disabled).toBe(false)
      await user.click(submit)

      await waitFor(() => {
        expect(mockedCreate).toHaveBeenCalled()
      })
      const payload = mockedCreate.mock.calls[0][0]
      expect(payload.customer.document).toBe('52998224725')
      expect(payload.deliveryMethod).toBe('pickup')
      expect(payload.shippingAddress).toBeUndefined()
      expect(payload.shipping).toBeUndefined()
      // No quote is requested: pickup does not depend on a CEP.
      expect(mockedQuote).not.toHaveBeenCalled()
    })
  })

  /**
   * The checkout of 01/10/2026: every "Voltar" on the card step dropped the
   * order and the next "Continuar" made another — eight pending orders for one
   * buyer. And a refused buyer had no way to PIX but to start over.
   */
  describe('passo do cartão', () => {
    async function reachCardStep() {
      const user = userEvent.setup()
      mockedCreate.mockResolvedValueOnce({
        order: { id: 'ord-card', orderNumber: 32, status: 'pending', total: 100 },
        requiresCard: true,
      } as never)
      render(
        <MemoryRouter>
          <ShopCheckout />
        </MemoryRouter>
      )
      await user.type(screen.getByLabelText(/Nome completo/i), 'Lucas Lima')
      await user.type(screen.getByLabelText(/^Email/i), 'lucas@test.com')
      await user.type(screen.getByLabelText(/^CPF/i), '52998224725')
      await user.click(screen.getByRole('button', { name: /Retirar na loja/i }))
      await user.click(screen.getByRole('button', { name: /Cartão de crédito/i }))
      await user.click(screen.getByRole('button', { name: /Continuar/i }))
      await screen.findByTestId('card-form')
      return user
    }

    it('Voltar fecha o pedido em vez de deixá-lo pendente', async () => {
      const user = await reachCardStep()
      await user.click(screen.getByRole('button', { name: 'mock-voltar' }))
      expect(mockedAbandon).toHaveBeenCalledWith('ord-card')
      expect(screen.queryByTestId('card-form')).not.toBeInTheDocument()
    })

    it('depois de uma recusa, troca para PIX sem refazer o checkout', async () => {
      const user = await reachCardStep()
      mockedCreate.mockResolvedValueOnce({
        order: { id: 'ord-pix', orderNumber: 33, status: 'pending', total: 100 },
        pixData: { emvCode: '00020126PIXCODE', txId: 'ch_3', provider: 'pagarme' },
      } as never)

      await user.click(screen.getByRole('button', { name: 'mock-pix' }))

      expect(mockedAbandon).toHaveBeenCalledWith('ord-card')
      await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(2))
      expect(mockedCreate.mock.calls[1][0].paymentMethod).toBe('pix')
      expect(await screen.findByTestId('qr')).toBeInTheDocument()
    })
  })

  it('sugere o e-mail certo quando o domínio parece digitado errado', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ShopCheckout />
      </MemoryRouter>
    )
    await user.type(screen.getByLabelText(/^Email/i), 'lucas@gamil.com')
    await user.click(screen.getByRole('button', { name: 'lucas@gmail.com' }))
    expect(screen.getByLabelText(/^Email/i)).toHaveValue('lucas@gmail.com')
    expect(screen.queryByText(/Você quis dizer/i)).not.toBeInTheDocument()
  })
})
