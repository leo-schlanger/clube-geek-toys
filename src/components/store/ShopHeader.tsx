import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ShoppingCart, Search, User, Menu, CalendarHeart, Package, Wallet, Building2 } from 'lucide-react'
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
import { NotificationBell } from './NotificationBell'

interface ShopHeaderProps {
  /** Active member: shows the discount badge in the header. */
  isMember?: boolean
  /** Canal atacado — branding e busca em /atacado. */
  isWholesale?: boolean
}

/**
 * Shop header: logo, a always-visible search with its button,
 * carrinho (gaveta) e login/avatar. Busca → /?search=... (ou /atacado?search=).
 */
export function ShopHeader({ isMember = false, isWholesale = false }: ShopHeaderProps) {
  const { count } = useCart()
  const { user } = useAuth()
  const { isApproved: isWholesaleApproved } = useWholesaleAccount()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [term, setTerm] = useState(() => searchParams.get('search') ?? '')
  const [creditBalance, setCreditBalance] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Keeps the field in step when the query param changes, e.g. link navigation.
  // queueMicrotask avoids a synchronous setState in the effect body.
  useEffect(() => {
    queueMicrotask(() => setTerm(searchParams.get('search') ?? ''))
  }, [searchParams])

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
    const next = new URLSearchParams()
    if (q) next.set('search', q)
    const sort = searchParams.get('sort')
    if (sort) next.set('sort', sort)
    const qs = next.toString().replace(/\+/g, '%20')
    navigate(qs ? `${base}?${qs}` : base)
  }

  const searchPlaceholder = isWholesale
    ? 'Buscar no atacado...'
    : 'Buscar produtos, marcas, merch...'

  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        {/* Linha 1: logo + canais + ações */}
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:h-16 sm:gap-3">
          {/* Logo */}
          <Link to={isWholesale ? '/atacado' : '/'} className="flex shrink-0 items-center gap-2">
            <img src="/logo-vip.png" alt="Clube GeekPop & Toys" className="h-8 w-auto sm:h-9" />
            <span className="hidden text-sm font-heading font-semibold lg:inline">
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
              className="hidden shrink-0 text-primary md:inline-flex"
              onClick={() => navigate('/evento')}
            >
              <CalendarHeart className="h-4 w-4" />
              Evento
            </Button>
          )}

          {/* Busca (desktop / tablet) — estilo Shopee: borda brand + botão Buscar */}
          <form
            onSubmit={handleSearch}
            className="relative ml-1 hidden min-w-0 flex-1 items-stretch sm:flex"
          >
            <div className="flex w-full overflow-hidden rounded-md border-2 border-primary bg-background shadow-sm focus-within:ring-2 focus-within:ring-primary/30">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  type="search"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-10 border-0 bg-transparent pl-9 pr-2 shadow-none focus-visible:ring-0"
                  aria-label="Buscar produtos"
                />
              </div>
              <Button
                type="submit"
                className="h-10 shrink-0 rounded-none rounded-r-[4px] px-4 text-sm font-semibold"
                aria-label="Pesquisar"
              >
                <Search className="h-4 w-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Buscar</span>
              </Button>
            </div>
          </form>

          {/* Ações */}
          <div className="ml-auto flex items-center gap-0.5 sm:ml-0 sm:gap-1">
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
            {user && <NotificationBell />}

            {/* Login / conta */}
            {user ? (
              <Button variant="ghost" size="icon" asChild aria-label="Meu perfil">
                <Link to="/perfil">
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

        {/* Linha 2 mobile: busca sempre visível (padrão Shopee) */}
        <form onSubmit={handleSearch} className="border-t px-3 py-2 sm:hidden">
          <div className="flex overflow-hidden rounded-md border-2 border-primary bg-background shadow-sm focus-within:ring-2 focus-within:ring-primary/30">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-10 border-0 bg-transparent pl-9 pr-2 shadow-none focus-visible:ring-0"
                aria-label="Buscar produtos"
              />
            </div>
            <Button
              type="submit"
              className="h-10 shrink-0 rounded-none rounded-r-[4px] px-3.5 font-semibold"
              aria-label="Pesquisar"
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </form>
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
