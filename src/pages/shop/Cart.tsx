import { Link } from 'react-router-dom'
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight, ImageOff, Sparkles } from 'lucide-react'
import { MEMBER_SHOP_DISCOUNT } from '../../types'
import { formatCurrency } from '../../lib/utils'
import { useCart } from '../../contexts/CartContext'
import { ShopHeader } from '../../components/store/ShopHeader'
import { MemberDiscountBadge } from '../../components/store/MemberDiscountBadge'
import { useShopMember } from '../../components/store/useShopMember'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'

export default function Cart() {
  const { items, subtotal, setQuantity, removeItem } = useCart()
  const { isMember } = useShopMember()

  const estimatedDiscount = isMember ? subtotal * MEMBER_SHOP_DISCOUNT : 0
  const estimatedTotal = subtotal - estimatedDiscount

  return (
    <div className="min-h-screen bg-background">
      <ShopHeader isMember={isMember} />

      <main className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="mb-6 text-2xl font-heading font-bold">Meu carrinho</h1>

        {items.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
              <ShoppingBag className="h-14 w-14 text-muted-foreground" />
              <div>
                <p className="text-lg font-medium">Seu carrinho está vazio</p>
                <p className="text-muted-foreground">
                  Que tal explorar nossos produtos geek?
                </p>
              </div>
              <Button asChild size="lg">
                <Link to="/">Ir às compras</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
            {/* Itens */}
            <div className="space-y-3">
              {items.map((item) => (
                <Card key={item.productId}>
                  <CardContent className="flex gap-4 p-4">
                    <Link
                      to={`/produto/${item.slug}`}
                      className="h-20 w-20 shrink-0 overflow-hidden rounded-md bg-muted"
                    >
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <ImageOff className="h-6 w-6" />
                        </div>
                      )}
                    </Link>

                    <div className="flex flex-1 flex-col">
                      <Link
                        to={`/produto/${item.slug}`}
                        className="font-medium leading-snug hover:text-primary"
                      >
                        {item.name}
                      </Link>
                      <span className="text-sm text-muted-foreground">
                        {formatCurrency(item.price)} cada
                      </span>

                      <div className="mt-auto flex items-center gap-3 pt-2">
                        <div className="flex items-center rounded-md border">
                          <button
                            type="button"
                            aria-label="Diminuir quantidade"
                            className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
                            onClick={() => setQuantity(item.productId, item.quantity - 1)}
                            disabled={item.quantity <= 1}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-9 text-center text-sm tabular-nums">{item.quantity}</span>
                          <button
                            type="button"
                            aria-label="Aumentar quantidade"
                            className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
                            onClick={() => setQuantity(item.productId, item.quantity + 1)}
                            disabled={item.quantity >= item.stock}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <button
                          type="button"
                          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-destructive"
                          onClick={() => removeItem(item.productId)}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="hidden sm:inline">Remover</span>
                        </button>
                      </div>
                    </div>

                    <div className="text-right font-semibold tabular-nums">
                      {formatCurrency(item.price * item.quantity)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Resumo */}
            <div className="lg:sticky lg:top-20 lg:self-start">
              <Card>
                <CardContent className="space-y-4 p-4">
                  <h2 className="font-heading font-semibold">Resumo</h2>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="tabular-nums">{formatCurrency(subtotal)}</span>
                    </div>

                    {isMember ? (
                      <>
                        <div className="flex items-center justify-between text-green-600">
                          <span className="flex items-center gap-1.5">
                            <MemberDiscountBadge />
                          </span>
                          <span className="tabular-nums">-{formatCurrency(estimatedDiscount)}</span>
                        </div>
                        <div className="h-px bg-border" />
                        <div className="flex justify-between text-base font-semibold">
                          <span>Total estimado</span>
                          <span className="tabular-nums">{formatCurrency(estimatedTotal)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          O valor final é confirmado no checkout.
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="h-px bg-border" />
                        <div className="flex justify-between text-base font-semibold">
                          <span>Total</span>
                          <span className="tabular-nums">{formatCurrency(subtotal)}</span>
                        </div>
                        <Link
                          to="/entrar"
                          className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs transition-colors hover:bg-primary/10"
                        >
                          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                          <span>
                            Membros economizam 15%.{' '}
                            <strong className="text-primary">Entrar</strong>
                          </span>
                        </Link>
                      </>
                    )}
                  </div>

                  <Button asChild size="lg" className="w-full">
                    <Link to="/checkout">
                      Finalizar compra
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>

                  <Button asChild variant="ghost" size="sm" className="w-full">
                    <Link to="/">Continuar comprando</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
