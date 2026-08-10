import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ShoppingCart, Search, User, Menu, X, CalendarHeart, Package, Wallet, Building2 } from 'lucide-react'
import { getStoreCredit } from '../../lib/reviews'
import { formatCurrency, cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { useCart } from '../../contexts/CartContext'
import { useAuth } from '../../contexts/AuthContext'
import { CartDrawer } from './CartDrawer'
import { MemberDiscountBadge } from './MemberDiscountBadge'
import { ThemeToggle } from '../ThemeToggle'
import { isEventVisible } from '../../data/event'
import { useWholesaleAccount } from './useWholesaleAccount'

interface ShopHeaderProps {
  /** Membro ativo — mostra selo de desconto no cabeçalho. */
  isMember?: boolean
  /** Canal atacado — branding e busca em /atacado. */
  isWholesale?: boolean
}

/**
 * Cabeçalho da loja: logo, busca, carrinho (abre gaveta) e login/avatar.
 * A busca navega para /?search=... (ou /atacado?search= no canal atacado).
 */
export function ShopHeader({ isMember = false, isWholesale = false }: ShopHeaderProps) {
  const { count } = useCart()
  const { user } = useAuth()
  const { isApproved: isWholesaleApproved } = useWholesaleAccount()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [term, setTerm] = useState(() => searchParams.get('search') ?? '')
  const [creditBalance, setCreditBalance] = useState(0)
  const mobileInputRef = useRef<HTMLInputElement>(null)

  // Mantém o campo em sincronia quando o query param muda (ex.: navegação por link).
  // queueMicrotask evita o setState síncrono no corpo do efeito (cascading renders).
  useEffect(() => {
    queueMicrotask(() => setTerm(searchParams.get('search') ?? ''))
  }, [searchParams])

  useEffect(() => {
    if (mobileSearchOpen) mobileInputRef.current?.focus()
  }, [mobileSearchOpen])

  useEffect(() => {
    let active = true
    if (!user) {
      queueMicrotask(() => {
        if (active) setCreditBalance(0)
      })
      return () => {
        active = false
      }
    }
    getStoreCredit()
      .then((c) => {
        if (active) setCreditBalance(c.balance)
      })
      .catch(() => {
        if (active) setCreditBalance(0)
      })
    return () => {
      active = false
    }
  }, [user])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = term.trim()
    const base = isWholesale ? '/atacado' : '/'
    navigate(q ? `${base}?search=${encodeURIComponent(q)}` : base)
    setMobileSearchOpen(false)
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          {/* Logo */}
          <Link to={isWholesale ? '/atacado' : '/'} className="flex shrink-0 items-center gap-2">
            <img src="/logo-vip.png" alt="Clube GeekPop & Toys" className="h-9 w-auto" />
            <span className="hidden text-sm font-heading font-semibold sm:inline">
              {isWholesale ? 'Atacado GeekPop & Toys' : 'Loja GeekPop & Toys'}
            </span>
          </Link>

          {/* Aba Loja / Atacado */}
          <div className="hidden items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5 sm:flex">
            <Button
              variant={!isWholesale ? 'default' : 'ghost'}
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => navigate('/')}
            >
              Loja
            </Button>
            <Button
              variant={isWholesale ? 'default' : 'ghost'}
              size="sm"
              className="h-8 gap-1 px-3 text-xs"
              onClick={() => navigate('/atacado')}
            >
              <Building2 className="h-3.5 w-3.5" />
              Atacado
            </Button>
          </div>

          {isEventVisible() && !isWholesale && (
            <Button
              variant="ghost"
              size="sm"
              className="hidden shrink-0 text-primary sm:inline-flex"
              onClick={() => navigate('/evento')}
            >
              <CalendarHeart className="h-4 w-4" />
              Evento
            </Button>
          )}

          {/* Busca (desktop) */}
          <form onSubmit={handleSearch} className="relative hidden flex-1 md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder={isWholesale ? 'Buscar no atacado...' : 'Buscar produtos geek...'}
              className="pl-9"
              aria-label="Buscar produtos"
            />
          </form>

          {/* Ações */}
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            {/* Mobile: atalho Atacado */}
            <Button
              variant="ghost"
              size="sm"
              className="sm:hidden"
              onClick={() => navigate(isWholesale ? '/' : '/atacado')}
              aria-label={isWholesale ? 'Ir para loja' : 'Ir para atacado'}
            >
              <Building2 className="h-4 w-4" />
            </Button>

            {isMember && !isWholesale && <MemberDiscountBadge className="hidden sm:inline-flex" />}
            {isWholesale && (
              <Badge variant="outline" className="hidden text-xs sm:inline-flex">
                −25% B2B
              </Badge>
            )}

            <ThemeToggle variant="icon" />

            {/* Busca (mobile toggle) */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Buscar"
              onClick={() => setMobileSearchOpen((v) => !v)}
            >
              {mobileSearchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
            </Button>

            {/* Carrinho */}
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              aria-label="Abrir carrinho"
              onClick={() => setDrawerOpen(true)}
            >
              <ShoppingCart className="h-5 w-5" />
              {count > 0 && (
                <Badge
                  variant="default"
                  className={cn(
                    'absolute -right-1 -top-1 h-5 min-w-[1.25rem] justify-center rounded-full px-1 text-[10px] tabular-nums'
                  )}
                >
                  {count > 99 ? '99+' : count}
                </Badge>
              )}
            </Button>

            {/* Crédito de loja + Minhas compras */}
            {user && creditBalance > 0 && (
              <span
                className="hidden items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent sm:inline-flex"
                title="Crédito de loja (avaliações)"
              >
                <Wallet className="h-3 w-3" />
                {formatCurrency(creditBalance)}
              </span>
            )}
            {user && (
              <Button
                variant="ghost"
                size="icon"
                asChild
                aria-label="Minhas compras"
                className="hidden sm:inline-flex"
                title="Minhas compras"
              >
                <Link to="/minhas-compras">
                  <Package className="h-5 w-5" />
                </Link>
              </Button>
            )}

            {/* Login / conta */}
            {user ? (
              <Button variant="ghost" size="icon" asChild aria-label="Minha conta">
                <Link to="/minhas-compras">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <User className="h-4 w-4" />
                  </span>
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" asChild className="hidden sm:inline-flex">
                <Link to={isWholesale ? '/atacado/entrar' : '/entrar'}>Entrar</Link>
              </Button>
            )}
            {!user && (
              <Button variant="ghost" size="icon" asChild className="sm:hidden" aria-label="Entrar">
                <Link to={isWholesale ? '/atacado/entrar' : '/entrar'}>
                  <Menu className="h-5 w-5" />
                </Link>
              </Button>
            )}
          </div>
        </div>

        {/* Busca (mobile expandida) */}
        {mobileSearchOpen && (
          <form onSubmit={handleSearch} className="border-t p-3 md:hidden">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={mobileInputRef}
                type="search"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Buscar produtos geek..."
                className="pl-9"
                aria-label="Buscar produtos"
              />
            </div>
          </form>
        )}
      </header>

      <CartDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        isMember={isMember}
        isWholesaleApproved={isWholesale && isWholesaleApproved}
      />
    </>
  )
}

export default ShopHeader
