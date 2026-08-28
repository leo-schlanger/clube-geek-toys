import { MEMBER_SHOP_DISCOUNT, WHOLESALE_SHOP_DISCOUNT } from '../types'

/**
 * What the customer will be charged, worked out on screen.
 *
 * **The server is the authority.** `order.service` prices every order again
 * from the database and never trusts a number sent by the browser; this exists
 * so the cart, the drawer and the checkout can *show* the same figure before
 * the order is placed. It mirrors `promo.service.pickBestDiscount` on purpose —
 * if the two ever disagree, the server is right and this is the bug.
 *
 * It lives in one file because the rule used to be written out three times
 * (cart page, cart drawer, checkout). Adding the online promotion to three
 * copies is how one of them ends up quietly a percent behind.
 *
 * ## The rule
 *
 * Exactly one discount applies. Wholesale replaces the whole set with its own
 * 25%; on retail the member discount, the online promotion and a coupon are
 * candidates and **the largest wins**. Nothing stacks, so the customer always
 * pays the best price on offer.
 */

export interface ShopPromoLike {
  enabled: boolean
  /** Percentage points, 0–90. */
  percent: number
}

export interface AppliedCouponLike {
  code: string
  /** Percentage points, 0–90. */
  percent: number
}

export interface ShopDiscountInput {
  subtotal: number
  isWholesale?: boolean
  isWholesaleApproved?: boolean
  isMember?: boolean
  promo?: ShopPromoLike | null
  coupon?: AppliedCouponLike | null
}

export interface ShopDiscountResult {
  /** Percentage points actually applied. 0 when nothing applies. */
  percent: number
  /** Currency amount taken off the goods. Never off the shipping. */
  amount: number
  /** Goods after the discount. Shipping is added later, by the caller. */
  total: number
  /** What to print next to the discount line, or null when there is none. */
  label: string | null
  /** Machine-readable winner, matching the server's `discount_reason`. */
  reason: 'wholesale_25' | 'member_10' | 'online' | 'coupon' | null
}

const NOTHING: ShopDiscountResult = {
  percent: 0,
  amount: 0,
  total: 0,
  label: null,
  reason: null,
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function resolveShopDiscount(input: ShopDiscountInput): ShopDiscountResult {
  const subtotal = Number.isFinite(input.subtotal) ? Math.max(0, input.subtotal) : 0

  if (input.isWholesale) {
    // The wholesale channel never sees a coupon or the site promotion.
    const percent = input.isWholesaleApproved ? WHOLESALE_SHOP_DISCOUNT * 100 : 0
    if (percent <= 0) return { ...NOTHING, total: subtotal }
    const amount = round2(subtotal * (percent / 100))
    return {
      percent,
      amount,
      total: round2(subtotal - amount),
      label: `Desconto atacado (${Math.round(percent)}%)`,
      reason: 'wholesale_25',
    }
  }

  // Order matters on a tie: the member discount is credited first, because it
  // is the one the customer would lose by cancelling the plan.
  const candidates: { percent: number; label: string; reason: ShopDiscountResult['reason'] }[] = []

  if (input.isMember) {
    const percent = MEMBER_SHOP_DISCOUNT * 100
    candidates.push({
      percent,
      label: `Desconto membro (${Math.round(percent)}%)`,
      reason: 'member_10',
    })
  }
  if (input.promo?.enabled && input.promo.percent > 0) {
    candidates.push({
      percent: input.promo.percent,
      label: `Desconto do site (${formatPercent(input.promo.percent)}%)`,
      reason: 'online',
    })
  }
  if (input.coupon && input.coupon.percent > 0) {
    candidates.push({
      percent: input.coupon.percent,
      label: `Cupom ${input.coupon.code.toUpperCase()} (${formatPercent(input.coupon.percent)}%)`,
      reason: 'coupon',
    })
  }

  let best: (typeof candidates)[number] | null = null
  for (const c of candidates) {
    if (!best || c.percent > best.percent) best = c
  }
  if (!best) return { ...NOTHING, total: subtotal }

  const amount = round2(subtotal * (best.percent / 100))
  return {
    percent: best.percent,
    amount,
    total: round2(subtotal - amount),
    label: best.label,
    reason: best.reason,
  }
}

/** `5` stays `5`, `7.5` becomes `7,5` — no trailing `,0` on whole numbers. */
export function formatPercent(percent: number): string {
  return Number.isInteger(percent) ? String(percent) : String(percent).replace('.', ',')
}

/**
 * Turns a stored `discount_reason` into something a customer can read.
 *
 * The confirmation used to print "Desconto clube 10%" for *any* discount,
 * because the club discount was the only one that existed. It now has to name
 * the online promotion and coupons too, and a wrong label on a receipt is a
 * support message.
 */
export function describeDiscountReason(
  reason: string | null | undefined,
  storeCreditApplied = 0
): string {
  if (!reason) return 'Desconto'

  // `<base>+store_credit`: two things in one line, so name neither.
  if (storeCreditApplied > 0 && reason.includes('+')) return 'Descontos'
  if (reason === 'store_credit') return 'Crédito de avaliação'

  const base = reason.split('+')[0]
  if (base === 'wholesale_25') return 'Desconto atacado (25%)'
  if (base === 'member_10') return `Desconto clube (${Math.round(MEMBER_SHOP_DISCOUNT * 100)}%)`
  if (base === 'online') return 'Desconto do site'
  if (base.startsWith('coupon_')) return `Cupom ${base.slice('coupon_'.length)}`
  return 'Desconto'
}

/**
 * The list price rewritten as the online price.
 *
 * The promotion was live and correct for two days and still read as "não foi
 * aplicado", because it only ever appeared in the basket: the catalogue went on
 * printing the counter price, so the one place a customer compares prices never
 * moved. The shop was asked to *be* cheaper online, not to reveal it at
 * checkout.
 *
 * Display only, like every other price on the storefront — `order.service`
 * prices the order again and is the authority. Returns `null` when there is no
 * promotion, so the caller keeps its existing markup untouched.
 *
 * The member discount is deliberately *not* folded in here. It is worked out
 * from the list price by the caller and shown on its own line, because the two
 * do not stack: 10% instead of 5%, never 14.5%.
 */
export function applyShopPromo(
  listPrice: number,
  promo: ShopPromoLike | null | undefined
): { price: number; listPrice: number; percent: number } | null {
  if (!promo?.enabled || !(promo.percent > 0)) return null
  if (!Number.isFinite(listPrice) || listPrice <= 0) return null
  const percent = Math.min(90, promo.percent)
  return {
    price: round2(listPrice * (1 - percent / 100)),
    listPrice: round2(listPrice),
    percent,
  }
}
