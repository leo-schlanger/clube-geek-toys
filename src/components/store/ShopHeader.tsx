import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ShoppingCart, Search, User, Menu, X } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { useCart } from '../../contexts/CartContext'
import { useAuth } from '../../contexts/AuthContext'
import { CartDrawer } from './CartDrawer'
import { MemberDiscountBadge } from './MemberDiscountBadge'
import { cn } from '../../lib/utils'

interface ShopHeaderProps {
  /** Membro ativo — mostra selo de desconto no cabeçalho. */
  isMember?: boolean
}

/**
 * Cabeçalho da loja: logo, busca, carrinho (abre gaveta) e login/avatar.
 * A busca navega para /?search=... (a home lê o query param).
 */
export function ShopHeader({ isMember = false }: ShopHeaderProps) {
  const { count } = useCart()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [term, setTerm] = useState(() => searchParams.get('search') ?? '')
  const mobileInputRef = useRef<HTMLInputElement>(null)

  // Mantém o campo em sincronia quando o query param muda (ex.: navegação por link).
  // queueMicrotask evita o setState síncrono no corpo do efeito (cascading renders).
  useEffect(() => {
    queueMicrotask(() => setTerm(searchParams.get('search') ?? ''))
  }, [searchParams])

  useEffect(() => {
    if (mobileSearchOpen) mobileInputRef.current?.focus()
  }, [mobileSearchOpen])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = term.trim()
    navigate(q ? `/?search=${encodeURIComponent(q)}` : '/')
    setMobileSearchOpen(false)
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          {/* Logo */}
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <img src="/logo-vip.png" alt="Clube Geek & Toys" className="h-9 w-auto" />
            <span className="hidden text-sm font-heading font-semibold sm:inline">
              Loja Geek & Toys
            </span>
          </Link>

          {/* Busca (desktop) */}
          <form onSubmit={handleSearch} className="relative hidden flex-1 md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Buscar produtos geek..."
              className="pl-9"
              aria-label="Buscar produtos"
            />
          </form>

          {/* Ações */}
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            {isMember && <MemberDiscountBadge className="hidden sm:inline-flex" />}

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

            {/* Login / conta */}
            {user ? (
              <Button variant="ghost" size="icon" asChild aria-label="Minha conta">
                <Link to="/entrar">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <User className="h-4 w-4" />
                  </span>
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" asChild className="hidden sm:inline-flex">
                <Link to="/entrar">Entrar</Link>
              </Button>
            )}
            {!user && (
              <Button variant="ghost" size="icon" asChild className="sm:hidden" aria-label="Entrar">
                <Link to="/entrar">
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

      <CartDrawer open={drawerOpen} onOpenChange={setDrawerOpen} isMember={isMember} />
    </>
  )
}

export default ShopHeader
