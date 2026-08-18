import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import type { CartItem, Product, ProductVariant, ShopChannel } from '../types'
import { availableStock } from '../lib/products'

const STORAGE_KEY_RETAIL = 'clube_geek_shop_cart'
const STORAGE_KEY_WHOLESALE = 'clube_geek_shop_cart_wholesale'

function storageKey(channel: ShopChannel): string {
  return channel === 'wholesale' ? STORAGE_KEY_WHOLESALE : STORAGE_KEY_RETAIL
}

interface CartContextValue {
  items: CartItem[]
  count: number
  subtotal: number
  channel: ShopChannel
  addItem: (product: Product, quantity?: number, variant?: ProductVariant | null) => void
  /** lineKey = productId or productId::variantId */
  removeItem: (lineKey: string) => void
  setQuantity: (lineKey: string, quantity: number) => void
  clear: () => void
}

function lineKey(productId: string, variantId?: string | null): string {
  return variantId ? `${productId}::${variantId}` : productId
}

function itemKey(i: CartItem): string {
  return lineKey(i.productId, i.variantId)
}

const CartContext = createContext<CartContextValue | null>(null)

function loadCart(channel: ShopChannel): CartItem[] {
  try {
    const raw = localStorage.getItem(storageKey(channel))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function channelFromPath(pathname: string): ShopChannel {
  return pathname.startsWith('/atacado') ? 'wholesale' : 'retail'
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const channel = channelFromPath(pathname)

  // Keyed state: when channel changes, remount items from the other storage key.
  // Using channel as part of initial state + a version key avoids sync setState-in-effect.
  const [cartVersion, setCartVersion] = useState(0)
  const [activeChannel, setActiveChannel] = useState<ShopChannel>(channel)
  const [items, setItems] = useState<CartItem[]>(() => loadCart(channel))

  // Swap the cart when moving between retail and wholesale; async avoids the
  // cascading-render lint.
  useEffect(() => {
    if (channel === activeChannel) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setActiveChannel(channel)
      setItems(loadCart(channel))
      setCartVersion((v) => v + 1)
    })
    return () => {
      cancelled = true
    }
  }, [channel, activeChannel])

  // Persist to localStorage (per-channel, per-origin).
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(activeChannel), JSON.stringify(items))
    } catch {
      // storage full / disabled — ignore
    }
  }, [items, activeChannel, cartVersion])

  const addItem = useCallback(
    (product: Product, quantity = 1, variant?: ProductVariant | null) => {
      setItems((prev) => {
        const vId = variant?.id ?? null
        const key = lineKey(product.id, vId)
        // The cart ceiling is what is available, not what is physically there:
        // units another pending order holds must not be counted again here.
        const maxStock = variant ? availableStock(variant) : availableStock(product)
        const price = variant ? variant.price : product.price
        const image =
          (variant?.images?.[0] ?? product.images[0] ?? null) as string | null
        const label = variant?.name ?? null
        const displayName = variant ? `${product.name} — ${variant.name}` : product.name
        const minQty =
          activeChannel === 'wholesale' && product.wholesaleMinQty
            ? Math.max(1, product.wholesaleMinQty)
            : 1
        const existing = prev.find((i) => itemKey(i) === key)
        if (existing) {
          const nextQty = Math.min(Math.max(existing.quantity + quantity, minQty), maxStock)
          return prev.map((i) =>
            itemKey(i) === key ? { ...i, quantity: nextQty, stock: maxStock, price } : i
          )
        }
        const initial = Math.min(Math.max(quantity, minQty), maxStock) || minQty
        return [
          ...prev,
          {
            productId: product.id,
            variantId: vId,
            variantLabel: label,
            name: displayName,
            slug: product.slug,
            price,
            image,
            quantity: initial,
            stock: maxStock,
          },
        ]
      })
    },
    [activeChannel]
  )

  const removeItem = useCallback((key: string) => {
    setItems((prev) => prev.filter((i) => itemKey(i) !== key && i.productId !== key))
  }, [])

  const setQuantity = useCallback((key: string, quantity: number) => {
    setItems((prev) =>
      prev
        .map((i) =>
          itemKey(i) === key || i.productId === key
            ? { ...i, quantity: Math.max(1, Math.min(quantity, i.stock)) }
            : i
        )
        .filter((i) => i.quantity > 0)
    )
  }, [])

  const clear = useCallback(() => setItems([]), [])

  const subtotal = useMemo(() => items.reduce((sum, i) => sum + i.price * i.quantity, 0), [items])
  const count = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items])

  const value = useMemo(
    () => ({
      items,
      count,
      subtotal,
      channel: activeChannel,
      addItem,
      removeItem,
      setQuantity,
      clear,
    }),
    [items, count, subtotal, activeChannel, addItem, removeItem, setQuantity, clear]
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart deve ser usado dentro de <CartProvider>')
  return ctx
}
