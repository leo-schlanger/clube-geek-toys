import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const addItem = vi.fn()

vi.mock('../../contexts/CartContext', () => ({
  useCart: () => ({ addItem, items: [], count: 0, subtotal: 0, channel: 'retail', removeItem: vi.fn(), setQuantity: vi.fn(), clear: vi.fn() }),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

// The card prices itself with the online promotion, which is admin-configurable.
// Mutable so a test can turn it on without a QueryClientProvider.
const promoState = {
  promo: { enabled: false, percent: 0, bannerEnabled: false, bannerText: '' },
  loading: false,
}
vi.mock('../../hooks/useShopPromo', () => ({
  useShopPromo: () => promoState,
}))

// The card carries the save button, which reads the account and fetches saved
// ids. The focus here is the storefront, so it renders as a visitor; its own
// behaviour is covered in SaveProductButton.test.tsx.
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('../../lib/profile', () => ({
  saveProduct: vi.fn(),
  unsaveProduct: vi.fn(),
  loadSavedIds: vi.fn(async () => new Set<string>()),
  markSavedInCache: vi.fn(),
}))

import { ProductCard } from './ProductCard'
import { toast } from 'sonner'

const product = {
  id: 'p1',
  name: 'Photocard X',
  slug: 'photocard-x',
  description: null,
  price: 100,
  compareAtPrice: 120,
  categoryId: null,
  categoryName: 'Música',
  images: ['https://example.com/a.jpg'],
  stock: 10,
  sku: 'SKU1',
  active: true,
  featured: true,
  wholesaleEnabled: true,
  wholesaleMinQty: 3,
  createdAt: '',
  updatedAt: '',
}

describe('ProductCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    promoState.promo = { enabled: false, percent: 0, bannerEnabled: false, bannerText: '' }
  })

  it('renders product and member preview', () => {
    render(
      <MemoryRouter>
        <ProductCard product={product} isMember />
      </MemoryRouter>
    )
    expect(screen.getByText('Photocard X')).toBeInTheDocument()
    expect(screen.getByText(/Membro/i)).toBeInTheDocument()
  })

  it('adds to cart on button click', () => {
    render(
      <MemoryRouter>
        <ProductCard product={product} />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByRole('button', { name: /Adicionar/i }))
    expect(addItem).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalled()
  })

  it('wholesale mode uses atacado path and min qty', () => {
    render(
      <MemoryRouter>
        <ProductCard product={product} isWholesale isWholesaleApproved />
      </MemoryRouter>
    )
    const link = screen.getAllByRole('link')[0]
    expect(link.getAttribute('href')).toContain('/atacado/produto/')
    fireEvent.click(screen.getByRole('button', { name: /Adicionar/i }))
    expect(addItem).toHaveBeenCalledWith(product, 3)
  })

  it('shows esgotado when stock 0', () => {
    render(
      <MemoryRouter>
        <ProductCard product={{ ...product, stock: 0 }} />
      </MemoryRouter>
    )
    expect(screen.getAllByText(/Esgotado/i).length).toBeGreaterThan(0)
  })

  // The promotion was live and priced orders correctly for two days and still
  // read as "não foi aplicado", because the catalogue went on printing the
  // counter price. The number on the card is the point of the feature.
  it('prices the card with the online promotion', () => {
    promoState.promo = { enabled: true, percent: 5, bannerEnabled: true, bannerText: '' }
    render(
      <MemoryRouter>
        <ProductCard product={product} />
      </MemoryRouter>
    )
    expect(screen.getByText(/95,00/)).toBeInTheDocument()
    expect(screen.getByText(/−5% no site/)).toBeInTheDocument()
    // Member preview stays 10% off the list price: the two never stack.
    expect(screen.getByText(/Membros pagam.*90,00/)).toBeInTheDocument()
  })

  it('leaves the list price alone when there is no promotion', () => {
    render(
      <MemoryRouter>
        <ProductCard product={product} />
      </MemoryRouter>
    )
    expect(screen.getByText(/100,00/)).toBeInTheDocument()
    expect(screen.queryByText(/no site/)).not.toBeInTheDocument()
  })

  // Wholesale is priced by its own channel; announcing a retail promotion there
  // advertises a discount checkout will not give.
  it('never applies the online promotion on the wholesale channel', () => {
    promoState.promo = { enabled: true, percent: 5, bannerEnabled: true, bannerText: '' }
    render(
      <MemoryRouter>
        <ProductCard product={product} isWholesale isWholesaleApproved />
      </MemoryRouter>
    )
    expect(screen.queryByText(/no site/)).not.toBeInTheDocument()
    expect(screen.getByText(/100,00/)).toBeInTheDocument()
  })
})

describe('ProductCard — salvar para depois', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the heart on retail', () => {
    render(
      <MemoryRouter>
        <ProductCard product={product} />
      </MemoryRouter>
    )
    expect(screen.getByRole('button', { name: /Salvar Photocard X/i })).toBeInTheDocument()
  })

  // Wholesale buys through an approved CNPJ; saving makes no sense there.
  it('hides the heart on wholesale', () => {
    render(
      <MemoryRouter>
        <ProductCard product={product} isWholesale isWholesaleApproved />
      </MemoryRouter>
    )
    expect(screen.queryByRole('button', { name: /Salvar/i })).not.toBeInTheDocument()
  })

  // A button inside an <a> is invalid HTML and the click would navigate.
  it('is not nested inside the product link', () => {
    const { container } = render(
      <MemoryRouter>
        <ProductCard product={product} />
      </MemoryRouter>
    )
    const save = screen.getByRole('button', { name: /Salvar Photocard X/i })
    expect(save.closest('a')).toBeNull()
    expect(container.querySelector('a button')).toBeNull()
  })
})

// Wholesale closed: the shelf stays up, the cart does not — the API would refuse the order.
describe('ProductCard — canal sem venda liberada', () => {
  beforeEach(() => vi.clearAllMocks())

  it('mostra "Em breve" e não adiciona ao carrinho', () => {
    render(
      <MemoryRouter>
        <ProductCard product={product} isWholesale canBuy={false} />
      </MemoryRouter>
    )
    const button = screen.getByRole('button', { name: /Em breve/i })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(addItem).not.toHaveBeenCalled()
  })
})
