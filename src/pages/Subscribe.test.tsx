import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

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
    Ticket: icon,
    QrCode: icon,
    Calculator: icon,
    ChevronDown: icon,
  }
})

vi.mock('../hooks/useActiveEvent', () => ({
  useActiveEvent: () => ({ event: { priceCents: 2000 }, visible: true, loading: false, isPlaceholder: false }),
}))

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

  it('renders the header with login button', () => {
    render(<Subscribe />)
    const loginLink = screen.getByRole('link', { name: /entrar$/i })
    expect(loginLink).toHaveAttribute('href', '/login')
  })

  it('renders "Visite a loja" links', () => {
    render(<Subscribe />)
    expect(screen.getAllByText('Visite a loja').length).toBeGreaterThanOrEqual(1)
  })

  it('sells the annual price and quotes it per month', () => {
    render(<Subscribe />)
    expect(screen.getAllByText(/R\$\s*159,90/).length).toBeGreaterThanOrEqual(3)
    expect(screen.getAllByText(/R\$\s*13,33/).length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('/ano').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('/mês')).not.toBeInTheDocument()
    expect(screen.queryByText(/12,50/)).not.toBeInTheDocument()
  })

  it('every signup link asks for the annual plan', () => {
    render(<Subscribe />)
    const links = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('/cadastro'))
    expect(links.length).toBeGreaterThanOrEqual(2)
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/cadastro?plano=club&tipo=annual')
    }
  })

  it('lists the plan benefits from CLUB_PLAN', () => {
    render(<Subscribe />)
    expect(screen.getByText('10% de desconto em qualquer produto')).toBeInTheDocument()
    expect(screen.getByText('50% de desconto nos ingressos dos eventos')).toBeInTheDocument()
    expect(screen.getByText('Brinde na primeira compra da loja')).toBeInTheDocument()
  })

  it('shows the savings on example purchases', () => {
    render(<Subscribe />)
    expect(screen.getByText('Um álbum de R$ 150,00')).toBeInTheDocument()
    expect(screen.getByText('você guarda R$ 15,00')).toBeInTheDocument()
  })

  it('prices the ticket benefit from the active event', () => {
    render(<Subscribe />)
    expect(screen.getByText(/Um ingresso de R\$ 20,00 sai por R\$ 10,00/)).toBeInTheDocument()
  })

  it('states the 7-day refund guarantee', () => {
    render(<Subscribe />)
    expect(screen.getByText('Risco zero: 7 dias para desistir')).toBeInTheDocument()
    expect(screen.getByText(/devolvemos 100% do valor/)).toBeInTheDocument()
  })

  it('answers the objections, including that it is not monthly', () => {
    render(<Subscribe />)
    expect(screen.getByText('Preciso pagar todo mês?')).toBeInTheDocument()
    expect(screen.getByText('Renova sozinho?')).toBeInTheDocument()
    expect(screen.getByText('Soma com outras promoções?')).toBeInTheDocument()
  })

  // ─── Calculator ────────────────────────────────────────────

  it('starts with a year that pays off', () => {
    render(<Subscribe />)
    // R$ 150/month → R$ 180 + 2 tickets → R$ 20 = R$ 200; 200 − 159,90 = 40,10
    expect(screen.getByText('R$ 200,00')).toBeInTheDocument()
    expect(screen.getByText(/sobram R\$ 40,10 no seu bolso/)).toBeInTheDocument()
  })

  it('says how far a light spender is from paying it off', () => {
    render(<Subscribe />)
    fireEvent.change(screen.getByLabelText(/gasta por mês/i), { target: { value: '50' } })
    fireEvent.change(screen.getByLabelText(/ingressos de evento/i), { target: { value: '0' } })
    // R$ 60 saved → R$ 99,90 short → R$ 83,25/month more, rounded up to R$ 85
    expect(screen.getByText(/Faltam R\$ 99,90 para o clube se pagar/)).toBeInTheDocument()
    expect(screen.getByText(/R\$ 85,00 a mais em compras por mês/)).toBeInTheDocument()
  })

  it('does NOT render multiple plan tiers or a points program', () => {
    render(<Subscribe />)
    expect(screen.queryByText('Silver')).not.toBeInTheDocument()
    expect(screen.queryByText('Gold')).not.toBeInTheDocument()
    expect(screen.queryByText(/Programa de pontos/)).not.toBeInTheDocument()
  })

  it('renders the footer with copyright and legal links', () => {
    render(<Subscribe />)
    expect(screen.getByText(/2026 GeekPop & Toys/)).toBeInTheDocument()
    expect(screen.getByText('Termos')).toHaveAttribute('href', '/termos')
    expect(screen.getByText('Privacidade')).toHaveAttribute('href', '/privacidade')
  })

  it('renders the RadioMiniPlayer component', () => {
    render(<Subscribe />)
    expect(screen.getByTestId('radio-mini-player')).toBeInTheDocument()
  })
})
