import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — declared before importing the component
// ---------------------------------------------------------------------------

vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={to} {...props}>{children}</a>
  ),
}))

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial: _i, animate: _a, transition: _t, exit: _e, whileInView: _w, viewport: _v, whileHover: _h, layout: _l, style: _s, ...rest } = props
      return <div {...rest}>{children}</div>
    },
    h1: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial: _i, animate: _a, transition: _t, ...rest } = props
      return <h1 {...rest}>{children}</h1>
    },
  },
}))

vi.mock('lucide-react', () => {
  const icon = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <span {...props}>{children}</span>
  return {
    Check: icon,
    X: icon,
    Sparkles: icon,
    ArrowRight: icon,
    Shield: icon,
    Zap: icon,
    Gift: icon,
    CreditCard: icon,
    ShoppingBag: icon,
  }
})

vi.mock('../components/RadioMiniPlayer', () => ({
  default: () => <div data-testid="radio-mini-player" />,
}))

// Import after all mocks
import Subscribe from './Subscribe'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Subscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── Header ─────────────────────────────────────────────────

  it('renders the header with login button', () => {
    render(<Subscribe />)
    const loginLink = screen.getByRole('link', { name: /entrar/i })
    expect(loginLink).toBeInTheDocument()
    expect(loginLink).toHaveAttribute('href', '/login')
  })

  it('renders "Visite a loja" links', () => {
    render(<Subscribe />)
    const links = screen.getAllByText('Visite a loja')
    expect(links.length).toBeGreaterThanOrEqual(1)
  })

  // ─── Hero section ───────────────────────────────────────────

  it('renders the hero tagline', () => {
    render(<Subscribe />)
    expect(screen.getByText(/vantagens VIP/)).toBeInTheDocument()
  })

  it('renders the single annual price in the hero', () => {
    render(<Subscribe />)
    // "Apenas R$ 149,99 /ano"
    expect(screen.getByText(/Apenas/)).toBeInTheDocument()
    const prices = screen.getAllByText(/R\$\s*149,99/)
    expect(prices.length).toBeGreaterThanOrEqual(1)
  })

  it('renders the ASSINE AGORA button', () => {
    render(<Subscribe />)
    expect(screen.getByRole('button', { name: /assine agora/i })).toBeInTheDocument()
  })

  // ─── Trust badges ──────────────────────────────────────────

  it('renders trust badges', () => {
    render(<Subscribe />)
    // These appear in both hero and bottom section, use getAllByText
    expect(screen.getAllByText('Pagamento seguro').length).toBeGreaterThanOrEqual(1)
  })

  // ─── Single plan card ──────────────────────────────────────

  it('renders the single plan section heading', () => {
    render(<Subscribe />)
    expect(screen.getByText('Plano do Clube')).toBeInTheDocument()
    expect(screen.getByText('Um único plano, anual, com tudo incluso.')).toBeInTheDocument()
  })

  it('renders the club plan name and discount', () => {
    render(<Subscribe />)
    expect(screen.getByText('Clube Geek & Toys')).toBeInTheDocument()
    // "15% em qualquer produto" aparece no card do plano e no hero
    expect(screen.getAllByText('15% em qualquer produto').length).toBeGreaterThanOrEqual(1)
  })

  it('renders the annual price on the plan card', () => {
    render(<Subscribe />)
    // Price appears in hero and plan card
    const prices = screen.getAllByText(/R\$\s*149,99/)
    expect(prices.length).toBeGreaterThanOrEqual(2)
    // "/ano" label appears near the price
    expect(screen.getAllByText('/ano').length).toBeGreaterThanOrEqual(1)
  })

  it('renders a single ASSINAR button linking to /cadastro?plano=club&tipo=annual', () => {
    render(<Subscribe />)
    const assinarLinks = screen.getAllByRole('link').filter(
      (link) => link.getAttribute('href')?.startsWith('/cadastro')
    )
    expect(assinarLinks).toHaveLength(1)
    expect(assinarLinks[0]).toHaveAttribute('href', '/cadastro?plano=club&tipo=annual')
  })

  it('does NOT render a monthly/annual toggle', () => {
    render(<Subscribe />)
    expect(screen.queryByText('Mensal')).not.toBeInTheDocument()
  })

  it('does NOT render multiple plan tiers (Silver/Gold/Black)', () => {
    render(<Subscribe />)
    expect(screen.queryByText('Silver')).not.toBeInTheDocument()
    expect(screen.queryByText('Gold')).not.toBeInTheDocument()
    expect(screen.queryByText('Black')).not.toBeInTheDocument()
  })

  it('does NOT render a plan comparison table', () => {
    render(<Subscribe />)
    expect(screen.queryByText('Compare os planos')).not.toBeInTheDocument()
    expect(screen.queryByText(/Multiplicador de pontos/)).not.toBeInTheDocument()
  })

  it('does NOT mention a points program', () => {
    render(<Subscribe />)
    expect(screen.queryByText(/Programa de pontos/)).not.toBeInTheDocument()
  })

  // ─── Plan benefits ─────────────────────────────────────────

  it('renders the club plan benefits list', () => {
    render(<Subscribe />)
    expect(screen.getByText('15% de desconto em qualquer produto')).toBeInTheDocument()
    expect(screen.getByText('Brinde especial de boas-vindas')).toBeInTheDocument()
    expect(screen.getByText('Entrada gratuita em eventos participantes')).toBeInTheDocument()
  })

  it('renders extra benefits (QR Code carteirinha, sem fidelidade)', () => {
    render(<Subscribe />)
    expect(screen.getByText('Carteirinha digital com QR Code')).toBeInTheDocument()
    expect(screen.getByText('Desconto válido na loja física e online')).toBeInTheDocument()
    expect(screen.getByText('Renovação anual, sem fidelidade')).toBeInTheDocument()
  })

  // ─── Features section ──────────────────────────────────────

  it('renders the "Por que ser VIP?" section with feature cards', () => {
    render(<Subscribe />)
    expect(screen.getByText('Por que ser VIP?')).toBeInTheDocument()
    expect(screen.getByText('15% de desconto')).toBeInTheDocument()
    expect(screen.getByText('Brinde especial')).toBeInTheDocument()
    expect(screen.getByText('Eventos participantes')).toBeInTheDocument()
    expect(screen.getByText('Carteirinha digital')).toBeInTheDocument()
  })

  // ─── Footer ─────────────────────────────────────────────────

  it('renders the footer with copyright', () => {
    render(<Subscribe />)
    expect(screen.getByText(/2026 Geek & Toys/)).toBeInTheDocument()
  })

  it('renders Termos and Privacidade links in footer', () => {
    render(<Subscribe />)
    expect(screen.getByText('Termos')).toHaveAttribute('href', '/termos')
    expect(screen.getByText('Privacidade')).toHaveAttribute('href', '/privacidade')
  })

  // ─── RadioMiniPlayer ───────────────────────────────────────

  it('renders the RadioMiniPlayer component', () => {
    render(<Subscribe />)
    expect(screen.getByTestId('radio-mini-player')).toBeInTheDocument()
  })
})
