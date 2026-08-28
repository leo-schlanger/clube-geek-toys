import { Link } from 'react-router-dom'
import { ShoppingCart, ImageOff } from 'lucide-react'
import { toast } from 'sonner'
import type { Product } from '../../types'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { formatCurrency, cn } from '../../lib/utils'
import { useCart } from '../../contexts/CartContext'
import { MEMBER_SHOP_DISCOUNT, WHOLESALE_SHOP_DISCOUNT } from '../../types'
import { applyShopPromo, formatPercent } from '../../lib/shop-discount'
import { useShopPromo } from '../../hooks/useShopPromo'
import { MemberDiscountBadge } from './MemberDiscountBadge'
import { SaveProductButton } from './SaveProductButton'
import { availableStock } from '../../lib/products'

interface ProductCardProps {
  product: Product
  /** Active member: shows the price with a discount preview. */
  isMember?: boolean
  /** Wholesale channel: /atacado/produto link, 25% preview, min qty. */
  isWholesale?: boolean
  /** Approved wholesale account: shows the price at -25%. */
  isWholesaleApproved?: boolean
  /** Closed channel (wholesale sales off): catalogue with no buy button. */
  canBuy?: boolean
}

/**
 * Storefront card. Links to the product page and adds straight to the cart.
 * Any discount shown is a preview; the real one is computed server-side.
 */
export function ProductCard({
  product,
  isMember = false,
  isWholesale = false,
  isWholesaleApproved = false,
  canBuy = true,
}: ProductCardProps) {
  const { addItem } = useCart()
  const { promo } = useShopPromo()

  const image = product.images?.[0] ?? null
  const outOfStock = availableStock(product) <= 0
  const onSale = product.compareAtPrice != null && product.compareAtPrice > product.price

  // The price the customer actually pays online. Wholesale is priced by its own
  // channel and never sees this. A product with variants is quoted "a partir
  // de" its cheapest SKU, so the promotion comes off that same figure.
  const listPrice =
    product.hasVariants && product.priceFrom != null ? product.priceFrom : product.price
  const sitePromo = isWholesale ? null : applyShopPromo(listPrice, promo)
  // One struck price, not two: `compareAtPrice` is the older, higher number
  // whenever the seller set one, and it is the one worth crossing out.
  const strikePrice =
    onSale && !product.hasVariants
      ? (product.compareAtPrice as number)
      : (sitePromo?.listPrice ?? null)

  // Off the list price, never off the promotional one — the two do not stack.
  const memberPrice = product.price * (1 - MEMBER_SHOP_DISCOUNT)
  const wholesalePrice = product.price * (1 - WHOLESALE_SHOP_DISCOUNT)
  const minQty = isWholesale ? Math.max(1, product.wholesaleMinQty ?? 1) : 1
  const href = isWholesale ? `/atacado/produto/${product.slug}` : `/produto/${product.slug}`

  function handleAdd(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (outOfStock || !canBuy) return
    addItem(product, minQty)
    toast.success(
      minQty > 1
        ? `${product.name} adicionado (${minQty} un. mín. atacado)`
        : `${product.name} adicionado ao carrinho`
    )
  }

  return (
    <Card className="group relative flex h-full flex-col overflow-hidden transition-all hover:border-primary/50 hover:shadow-lg">
      <Link to={href} className="relative block aspect-square overflow-hidden bg-muted">
        {image ? (
          <img
            src={image}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={(e) => {
              const el = e.currentTarget
              el.style.display = 'none'
              const fallback = el.nextElementSibling as HTMLElement | null
              if (fallback) fallback.classList.remove('hidden')
            }}
          />
        ) : null}
        <div
          className={cn(
            'flex h-full w-full flex-col items-center justify-center gap-1.5 bg-muted text-muted-foreground',
            image ? 'hidden absolute inset-0' : ''
          )}
        >
          <ImageOff className="h-10 w-10 opacity-60" />
          <span className="text-xs font-medium uppercase tracking-wide">Sem foto</span>
        </div>

        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {product.featured && <Badge variant="club">Destaque</Badge>}
          {onSale && <Badge variant="destructive">Promo</Badge>}
          {sitePromo && (
            <Badge className="bg-accent text-accent-foreground">
              −{formatPercent(sitePromo.percent)}% no site
            </Badge>
          )}
          {isWholesale && (
            <Badge className="bg-primary text-primary-foreground">Atacado</Badge>
          )}
        </div>

        {outOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-[1px]">
            <Badge variant="secondary" className="text-sm">
              Esgotado
            </Badge>
          </div>
        )}
      </Link>

      {/* Outside the <Link>: nesting a button in an anchor is invalid HTML and
          the click would navigate. Sits on the image, opposite the badges.
          Wholesale does not save — purchase there is by approved CNPJ. */}
      {!isWholesale && (
        <SaveProductButton
          productId={product.id}
          productName={product.name}
          className="absolute right-2 top-2 z-10 shadow-sm"
        />
      )}

      <CardContent className="flex flex-1 flex-col gap-2 p-4">
        <Link to={href} className="flex-1">
          {product.categoryName && (
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {product.categoryName}
            </span>
          )}
          <h3 className="line-clamp-2 font-medium leading-snug text-foreground transition-colors group-hover:text-primary">
            {product.name}
          </h3>
        </Link>

        <div className="mt-1 flex flex-col gap-0.5">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-foreground">
              {product.hasVariants && product.priceFrom != null
                ? `a partir de ${formatCurrency(sitePromo?.price ?? product.priceFrom)}`
                : formatCurrency(sitePromo?.price ?? product.price)}
            </span>
            {strikePrice != null && (
              <span className="text-sm text-muted-foreground line-through">
                {formatCurrency(strikePrice)}
              </span>
            )}
          </div>
          {product.hasVariants && (
            <span className="text-xs text-muted-foreground">Várias opções</span>
          )}

          {isWholesale ? (
            isWholesaleApproved ? (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  −25% atacado
                </Badge>
                <span className="text-sm font-semibold text-green-600">
                  {formatCurrency(wholesalePrice)}
                </span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                Atacadistas pagam {formatCurrency(wholesalePrice)}
              </span>
            )
          ) : isMember ? (
            <div className="flex items-center gap-2">
              <MemberDiscountBadge />
              <span className="text-sm font-semibold text-green-600">
                {formatCurrency(memberPrice)}
              </span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">
              Membros pagam {formatCurrency(memberPrice)}
            </span>
          )}

          {isWholesale && minQty > 1 && (
            <span className="text-xs text-muted-foreground">Mín. {minQty} un.</span>
          )}
        </div>

        <Button
          onClick={handleAdd}
          disabled={outOfStock || !canBuy}
          className={cn('mt-2 w-full', (outOfStock || !canBuy) && 'opacity-60')}
          size="sm"
        >
          <ShoppingCart className="h-4 w-4" />
          {!canBuy ? 'Em breve' : outOfStock ? 'Esgotado' : 'Adicionar'}
        </Button>
      </CardContent>
    </Card>
  )
}

export default ProductCard
