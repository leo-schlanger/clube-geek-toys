import { Link } from 'react-router-dom'
import { ShoppingCart, ImageOff } from 'lucide-react'
import { toast } from 'sonner'
import type { Product } from '../../types'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { formatCurrency, cn } from '../../lib/utils'
import { useCart } from '../../contexts/CartContext'
import { MEMBER_SHOP_DISCOUNT } from '../../types'
import { MemberDiscountBadge } from './MemberDiscountBadge'

interface ProductCardProps {
  product: Product
  /** Se o usuário logado é membro ativo — mostra preço com preview de desconto. */
  isMember?: boolean
}

/**
 * Card de vitrine de um produto. Linka para /produto/:slug e permite
 * adicionar direto ao carrinho. O desconto de membro exibido é só preview.
 */
export function ProductCard({ product, isMember = false }: ProductCardProps) {
  const { addItem } = useCart()

  const image = product.images?.[0] ?? null
  const outOfStock = product.stock <= 0
  const onSale = product.compareAtPrice != null && product.compareAtPrice > product.price
  const memberPrice = product.price * (1 - MEMBER_SHOP_DISCOUNT)

  function handleAdd(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (outOfStock) return
    addItem(product, 1)
    toast.success(`${product.name} adicionado ao carrinho`)
  }

  return (
    <Card className="group flex h-full flex-col overflow-hidden transition-all hover:border-primary/50 hover:shadow-lg">
      <Link
        to={`/produto/${product.slug}`}
        className="relative block aspect-square overflow-hidden bg-muted"
      >
        {image ? (
          <img
            src={image}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageOff className="h-10 w-10" />
          </div>
        )}

        {/* Selos sobre a imagem */}
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {product.featured && <Badge variant="club">Destaque</Badge>}
          {onSale && <Badge variant="destructive">Promo</Badge>}
        </div>

        {outOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-[1px]">
            <Badge variant="secondary" className="text-sm">Esgotado</Badge>
          </div>
        )}
      </Link>

      <CardContent className="flex flex-1 flex-col gap-2 p-4">
        <Link to={`/produto/${product.slug}`} className="flex-1">
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
              {formatCurrency(product.price)}
            </span>
            {onSale && (
              <span className="text-sm text-muted-foreground line-through">
                {formatCurrency(product.compareAtPrice as number)}
              </span>
            )}
          </div>

          {isMember ? (
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
        </div>

        <Button
          onClick={handleAdd}
          disabled={outOfStock}
          className={cn('mt-2 w-full', outOfStock && 'opacity-60')}
          size="sm"
        >
          <ShoppingCart className="mr-2 h-4 w-4" />
          {outOfStock ? 'Esgotado' : 'Adicionar'}
        </Button>
      </CardContent>
    </Card>
  )
}

export default ProductCard
