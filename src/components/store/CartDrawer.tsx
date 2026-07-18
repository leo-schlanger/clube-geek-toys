import { Link } from 'react-router-dom'
import { Minus, Plus, Trash2, ShoppingBag, ImageOff } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetClose,
} from '../ui/sheet'
import { Button } from '../ui/button'
import { formatCurrency } from '../../lib/utils'
import { useCart } from '../../contexts/CartContext'
import { MEMBER_SHOP_DISCOUNT } from '../../types'

interface CartDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Membro ativo — exibe estimativa de desconto (preview; total real no checkout). */
  isMember?: boolean
}

/**
 * Gaveta lateral do carrinho. Lista itens, permite ajustar quantidade/remover
 * e leva ao carrinho completo ou checkout.
 */
export function CartDrawer({ open, onOpenChange, isMember = false }: CartDrawerProps) {
  const { items, subtotal, count, setQuantity, removeItem } = useCart()

  const estimatedDiscount = isMember ? subtotal * MEMBER_SHOP_DISCOUNT : 0
  const estimatedTotal = subtotal - estimatedDiscount

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b p-4">
          <SheetTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            Seu carrinho {count > 0 && `(${count})`}
          </SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <ShoppingBag className="h-14 w-14 text-muted-foreground" />
            <div>
              <p className="font-medium">Seu carrinho está vazio</p>
              <p className="text-sm text-muted-foreground">
                Adicione produtos geek e volte aqui.
              </p>
            </div>
            <SheetClose asChild>
              <Button asChild>
                <Link to="/">Explorar produtos</Link>
              </Button>
            </SheetClose>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4">
              <ul className="space-y-4">
                {items.map((item) => (
                  <li key={item.productId} className="flex gap-3">
                    <Link
                      to={`/produto/${item.slug}`}
                      onClick={() => onOpenChange(false)}
                      className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted"
                    >
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <ImageOff className="h-5 w-5" />
                        </div>
                      )}
                    </Link>

                    <div className="flex flex-1 flex-col">
                      <Link
                        to={`/produto/${item.slug}`}
                        onClick={() => onOpenChange(false)}
                        className="line-clamp-2 text-sm font-medium hover:text-primary"
                      >
                        {item.name}
                      </Link>
                      <span className="text-sm text-muted-foreground">
                        {formatCurrency(item.price)}
                      </span>

                      <div className="mt-auto flex items-center gap-2 pt-1">
                        <div className="flex items-center rounded-md border">
                          <button
                            type="button"
                            aria-label="Diminuir quantidade"
                            className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
                            onClick={() => setQuantity(item.productId, item.quantity - 1)}
                            disabled={item.quantity <= 1}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-8 text-center text-sm tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            aria-label="Aumentar quantidade"
                            className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
                            onClick={() => setQuantity(item.productId, item.quantity + 1)}
                            disabled={item.quantity >= item.stock}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <button
                          type="button"
                          aria-label="Remover item"
                          className="ml-auto text-muted-foreground hover:text-destructive"
                          onClick={() => removeItem(item.productId)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="text-sm font-semibold tabular-nums">
                      {formatCurrency(item.price * item.quantity)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <SheetFooter className="flex-col gap-3 border-t p-4">
              <div className="w-full space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="tabular-nums">{formatCurrency(subtotal)}</span>
                </div>
                {isMember && (
                  <>
                    <div className="flex justify-between text-green-600">
                      <span>Desconto membro (15%)</span>
                      <span className="tabular-nums">-{formatCurrency(estimatedDiscount)}</span>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <span>Total estimado</span>
                      <span className="tabular-nums">{formatCurrency(estimatedTotal)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Valor final calculado no checkout.
                    </p>
                  </>
                )}
              </div>

              <div className="h-px w-full bg-border" />

              <div className="flex w-full flex-col gap-2">
                <SheetClose asChild>
                  <Button asChild className="w-full">
                    <Link to="/checkout">Finalizar compra</Link>
                  </Button>
                </SheetClose>
                <SheetClose asChild>
                  <Button asChild variant="outline" className="w-full">
                    <Link to="/carrinho">Ver carrinho</Link>
                  </Button>
                </SheetClose>
              </div>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

export default CartDrawer
