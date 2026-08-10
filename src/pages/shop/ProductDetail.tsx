import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ShoppingCart,
  Minus,
  Plus,
  ChevronLeft,
  ImageOff,
  ShieldCheck,
  Sparkles,
  Check,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Product } from '../../types'
import { MEMBER_SHOP_DISCOUNT, WHOLESALE_SHOP_DISCOUNT } from '../../types'
import { getProductBySlug, listRelatedProducts } from '../../lib/products'
import { formatCurrency, cn } from '../../lib/utils'
import { useCart } from '../../contexts/CartContext'
import { useAuth } from '../../contexts/AuthContext'
import { ShopHeader } from '../../components/store/ShopHeader'
import { MemberDiscountBadge } from '../../components/store/MemberDiscountBadge'
import { useShopMember } from '../../components/store/useShopMember'
import { useShopChannel } from '../../components/store/useShopChannel'
import { useWholesaleAccount } from '../../components/store/useWholesaleAccount'
import { VariantPicker, matchVariant } from '../../components/store/VariantPicker'
import { ProductGrid } from '../../components/store/ProductGrid'
import { PaymentTrustBadges } from '../../components/store/PaymentTrustBadges'
import { ProductReviews } from '../../components/store/ProductReviews'
import { StarRating } from '../../components/store/StarRating'
import { SeoHead } from '../../components/store/SeoHead'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Skeleton } from '../../components/ui/skeleton'

export default function ProductDetail() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { addItem } = useCart()
  const { user } = useAuth()
  const { isMember } = useShopMember()
  const channel = useShopChannel()
  const isWholesale = channel === 'wholesale'
  const { isApproved: isWholesaleApproved } = useWholesaleAccount()

  const [product, setProduct] = useState<Product | null>(null)
  const [related, setRelated] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [activeImage, setActiveImage] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [variantSel, setVariantSel] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!slug) return
    let active = true

    // Async runner keeps setState off the synchronous effect body
    // (product load below).
    async function loadProduct(productSlug: string) {
      setLoading(true)
      setNotFound(false)
      setActiveImage(0)
      setQuantity(1)
      setVariantSel({})
      setRelated([])
      try {
        const p = await getProductBySlug(productSlug)
        if (!active) return
        // No canal atacado, só exibir SKUs liberados (wholesale_enabled)
        if (!p || (isWholesale && p.wholesaleEnabled === false)) {
          setNotFound(true)
          setProduct(null)
        } else {
          setProduct(p)
          // Pré-seleciona 1ª opção de cada eixo se houver
          if (p.hasVariants && p.variantAxes?.length) {
            const init: Record<string, string> = {}
            for (const axis of p.variantAxes) {
              if (axis.options[0]) init[axis.name] = axis.options[0]
            }
            setVariantSel(init)
          }
          if (isWholesale && p.wholesaleMinQty && p.wholesaleMinQty > 1) {
            setQuantity(p.wholesaleMinQty)
          }
          listRelatedProducts(productSlug)
            .then((list) => {
              if (!active) return
              const filtered = isWholesale
                ? list.filter((x) => x.wholesaleEnabled !== false)
                : list
              setRelated(filtered)
            })
            .catch(() => {
              if (active) setRelated([])
            })
        }
      } catch {
        if (active) setNotFound(true)
      } finally {
        if (active) setLoading(false)
      }
    }

    loadProduct(slug)

    return () => {
      active = false
    }
  }, [slug, isWholesale])

  const matched = product ? matchVariant(product, variantSel) : null
  const displayPrice = matched?.price ?? product?.price ?? 0
  const displayStock = matched?.stock ?? product?.stock ?? 0
  const displayImages =
    matched?.images?.length ? matched.images : product?.images ?? []
  const outOfStock = product
    ? product.hasVariants
      ? !matched || matched.stock <= 0
      : product.stock <= 0
    : false
  const compareAt = matched?.compareAtPrice ?? product?.compareAtPrice ?? null
  const onSale = compareAt != null && compareAt > displayPrice
  const memberPrice = displayPrice * (1 - MEMBER_SHOP_DISCOUNT)
  const wholesalePrice = displayPrice * (1 - WHOLESALE_SHOP_DISCOUNT)
  const minQty =
    isWholesale && product ? Math.max(1, product.wholesaleMinQty ?? 1) : 1

  function handleAddToCart() {
    if (!product || outOfStock) return
    if (product.hasVariants && !matched) {
      toast.error('Selecione a variação (cor/tamanho) antes de adicionar.')
      return
    }
    const qty = Math.max(quantity, minQty)
    addItem(product, qty, matched)
    const label = matched ? `${product.name} — ${matched.name}` : product.name
    toast.success(
      minQty > 1
        ? `${label} adicionado (mín. ${minQty} un. no atacado)`
        : `${label} adicionado ao carrinho`
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {product && (
        <SeoHead
          title={product.name}
          description={
            product.description?.slice(0, 160) ||
            `${product.name} na loja GeekPop & Toys — K-pop e colecionáveis com frete Correios.`
          }
          path={isWholesale ? `/atacado/produto/${product.slug}` : `/produto/${product.slug}`}
          image={displayImages[0] || product.images[0]}
          type="product"
        />
      )}
      <ShopHeader isMember={isMember && !isWholesale} isWholesale={isWholesale} />

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="mb-4 -ml-2 text-muted-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </Button>

        {loading ? (
          <ProductDetailSkeleton />
        ) : notFound || !product ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <ImageOff className="h-12 w-12 text-muted-foreground" />
            <div>
              <h1 className="text-xl font-semibold">Produto não encontrado</h1>
              <p className="text-muted-foreground">
                Este produto pode ter saído do catálogo.
              </p>
            </div>
            <Button asChild>
              <Link to={isWholesale ? '/atacado' : '/'}>
                {isWholesale ? 'Voltar ao atacado' : 'Voltar para a loja'}
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-2">
            {/* Galeria */}
            <div className="space-y-3">
              <div className="aspect-square overflow-hidden rounded-xl border bg-muted">
                {displayImages.length > 0 ? (
                  <img
                    src={displayImages[Math.min(activeImage, displayImages.length - 1)]}
                    alt={product.name}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <ImageOff className="h-16 w-16" />
                  </div>
                )}
              </div>

              {displayImages.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {displayImages.map((img, i) => (
                    <button
                      key={img + i}
                      type="button"
                      onClick={() => setActiveImage(i)}
                      className={cn(
                        'h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 transition-colors',
                        activeImage === i ? 'border-primary' : 'border-transparent'
                      )}
                    >
                      <img src={img} alt={`${product.name} ${i + 1}`} className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex flex-col">
              <div className="flex flex-wrap items-center gap-2">
                {product.categoryName && (
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    {product.categoryName}
                  </span>
                )}
                {product.featured && <Badge variant="club">Destaque</Badge>}
              </div>

              <h1 className="mt-1 text-2xl font-heading font-bold sm:text-3xl">
                {product.name}
              </h1>

              {(product.ratingCount ?? 0) > 0 && (
                <div className="mt-2">
                  <StarRating
                    value={product.ratingAvg ?? 0}
                    size="sm"
                    showValue
                    count={product.ratingCount}
                  />
                </div>
              )}

              {product.sku && (
                <span className="mt-1 text-xs text-muted-foreground">SKU: {product.sku}</span>
              )}

              {/* Preço */}
              <div className="mt-4">
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-bold">{formatCurrency(displayPrice)}</span>
                  {onSale && compareAt != null && (
                    <span className="text-lg text-muted-foreground line-through">
                      {formatCurrency(compareAt)}
                    </span>
                  )}
                  {product.hasVariants && product.priceFrom != null && !matched && (
                    <span className="text-sm text-muted-foreground">
                      a partir de {formatCurrency(product.priceFrom)}
                    </span>
                  )}
                </div>

                <VariantPicker
                  product={product}
                  selected={variantSel}
                  onChange={setVariantSel}
                  matched={matched}
                />

                {/* Preview de desconto */}
                {isWholesale ? (
                  isWholesaleApproved ? (
                    <div className="mt-3 flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2">
                      <Badge className="bg-primary">−25% atacado</Badge>
                      <span className="text-sm">
                        Seu preço atacado:{' '}
                        <strong className="text-green-600">
                          {formatCurrency(wholesalePrice)}
                        </strong>
                      </span>
                    </div>
                  ) : (
                    <Link
                      to="/atacado/entrar"
                      className="mt-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm transition-colors hover:bg-primary/10"
                    >
                      <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                      <span>
                        Atacadistas aprovados ganham{' '}
                        <strong className="text-primary">25% de desconto</strong> (
                        {formatCurrency(wholesalePrice)})
                      </span>
                    </Link>
                  )
                ) : isMember ? (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2">
                    <MemberDiscountBadge />
                    <span className="text-sm">
                      Seu preço de membro:{' '}
                      <strong className="text-green-600">{formatCurrency(memberPrice)}</strong>
                    </span>
                  </div>
                ) : (
                  <Link
                    to="/entrar"
                    className="mt-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm transition-colors hover:bg-primary/10"
                  >
                    <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                    <span>
                      Entre e ganhe <strong className="text-primary">15% de desconto</strong> de
                      membro ({formatCurrency(memberPrice)})
                    </span>
                  </Link>
                )}
                {(isMember || (isWholesale && isWholesaleApproved)) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Desconto aplicado automaticamente no checkout.
                  </p>
                )}
                {isWholesale && minQty > 1 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Quantidade mínima no atacado: {minQty} un.
                  </p>
                )}
              </div>

              {/* Estoque */}
              <div className="mt-4 text-sm">
                {outOfStock ? (
                  <Badge variant="secondary">Esgotado</Badge>
                ) : displayStock <= 5 ? (
                  <span className="text-yellow-600">
                    Últimas {displayStock} unidades!
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-green-600">
                    <Check className="h-4 w-4" /> Em estoque
                  </span>
                )}
              </div>

              {/* Descrição */}
              {product.description && (
                <div className="mt-5">
                  <h2 className="mb-1 text-sm font-semibold">Descrição</h2>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                    {product.description}
                  </p>
                </div>
              )}

              {/* Quantidade + adicionar */}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center rounded-md border">
                  <button
                    type="button"
                    aria-label="Diminuir quantidade"
                    className="flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={outOfStock || quantity <= 1}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-12 text-center tabular-nums">{quantity}</span>
                  <button
                    type="button"
                    aria-label="Aumentar quantidade"
                    className="flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
                    onClick={() => setQuantity((q) => Math.min(displayStock, q + 1))}
                    disabled={outOfStock || quantity >= displayStock}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <Button
                  size="lg"
                  className="flex-1"
                  onClick={handleAddToCart}
                  disabled={outOfStock}
                >
                  <ShoppingCart className="h-5 w-5" />
                  {outOfStock ? 'Esgotado' : 'Adicionar ao carrinho'}
                </Button>
              </div>

              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-green-500" />
                Compra segura. Frete pelos Correios. Pagamento via PIX ou cartão.
              </div>

              <PaymentTrustBadges className="mt-4" compact />

              {!user && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Login é opcional — serve apenas para aplicar seu desconto de membro.
                </p>
              )}
            </div>
          </div>
        )}

        {product && (
          <ProductReviews
            productSlug={product.slug}
            ratingAvg={product.ratingAvg}
            ratingCount={product.ratingCount}
          />
        )}

        {product && related.length > 0 && (
          <section className="mt-12 border-t pt-10">
            <h2 className="mb-4 text-xl font-heading font-bold">Você também pode gostar</h2>
            <ProductGrid
              products={related}
              loading={false}
              isMember={isMember && !isWholesale}
              isWholesale={isWholesale}
              isWholesaleApproved={isWholesaleApproved}
            />
          </section>
        )}
      </main>
    </div>
  )
}

function ProductDetailSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-3">
        <Skeleton className="aspect-square w-full rounded-xl" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-16 rounded-md" />
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  )
}
