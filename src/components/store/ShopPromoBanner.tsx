import { useState } from 'react'
import { Tag, X } from 'lucide-react'
import { useShopPromo } from '../../hooks/useShopPromo'
import { useCart } from '../../contexts/CartContext'

/**
 * The announcement that explains why the site is cheaper than the counter.
 *
 * Keyed by percentage, not by a single flag: dismissing "5% mais barato" must
 * not hide "20% mais barato" next month. Same reasoning as the event banner,
 * which keys its dismissal by event id.
 *
 * In normal flow, never `sticky` — `ShopHeader` owns `top: 0`, and a second
 * sticky element at the same offset is what once covered the whole header.
 */
const STORAGE_PREFIX = 'shop-promo-banner-dismissed:'

function storageKey(percent: number) {
  return `${STORAGE_PREFIX}${percent}`
}

function isDismissed(percent: number): boolean {
  try {
    return localStorage.getItem(storageKey(percent)) === '1'
  } catch {
    return false
  }
}

export function ShopPromoBanner() {
  const { promo } = useShopPromo()
  const { channel } = useCart()
  const [dismissedPercent, setDismissedPercent] = useState<number | null>(null)

  // The wholesale channel has its own pricing; announcing a retail promotion
  // there would advertise a discount that checkout will not give.
  if (channel === 'wholesale') return null
  if (!promo.enabled || !promo.bannerEnabled) return null
  if (!promo.bannerText.trim()) return null
  if (dismissedPercent === promo.percent || isDismissed(promo.percent)) return null

  const dismiss = () => {
    try {
      localStorage.setItem(storageKey(promo.percent), '1')
    } catch {
      /* ignore */
    }
    setDismissedPercent(promo.percent)
  }

  return (
    <div
      role="region"
      aria-label="Aviso de promoção da loja"
      className="relative border-b border-accent/40 bg-accent/15 text-foreground"
    >
      <div className="relative mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-2 pr-10 text-center md:pr-12">
        <Tag className="hidden h-4 w-4 shrink-0 text-accent-foreground/80 sm:inline" aria-hidden />
        <p className="text-sm font-medium leading-snug">{promo.bannerText}</p>
      </div>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Fechar aviso"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-foreground/60 hover:bg-foreground/10 hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
