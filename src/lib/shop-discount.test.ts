import { describe, it, expect } from 'vitest'
import { resolveShopDiscount, formatPercent, applyShopPromo } from './shop-discount'

const PROMO_5 = { enabled: true, percent: 5 }
const PROMO_OFF = { enabled: false, percent: 5 }

describe('resolveShopDiscount', () => {
  it('takes nothing off when nothing applies', () => {
    expect(resolveShopDiscount({ subtotal: 100 })).toMatchObject({
      percent: 0,
      amount: 0,
      total: 100,
      label: null,
      reason: null,
    })
  })

  it('gives a non-member the online promotion', () => {
    expect(resolveShopDiscount({ subtotal: 100, promo: PROMO_5 })).toMatchObject({
      percent: 5,
      amount: 5,
      total: 95,
      reason: 'online',
    })
  })

  // The decision taken with the client: the site discount is a floor for people
  // who are not members, not a bonus on top of the club.
  it('does not stack the promotion on the member discount', () => {
    expect(
      resolveShopDiscount({ subtotal: 100, isMember: true, promo: PROMO_5 })
    ).toMatchObject({ percent: 10, amount: 10, total: 90, reason: 'member_10' })
  })

  it('lets the promotion win when it is the better offer', () => {
    expect(
      resolveShopDiscount({ subtotal: 100, isMember: true, promo: { enabled: true, percent: 20 } })
    ).toMatchObject({ percent: 20, amount: 20, reason: 'online' })
  })

  it('lets a coupon beat both', () => {
    expect(
      resolveShopDiscount({
        subtotal: 100,
        isMember: true,
        promo: PROMO_5,
        coupon: { code: 'verao30', percent: 30 },
      })
    ).toMatchObject({ percent: 30, amount: 30, total: 70, reason: 'coupon' })
  })

  it('names the coupon in upper case on the line', () => {
    const result = resolveShopDiscount({
      subtotal: 100,
      coupon: { code: 'verao30', percent: 30 },
    })
    expect(result.label).toBe('Cupom VERAO30 (30%)')
  })

  it('ignores a coupon worth nothing', () => {
    expect(
      resolveShopDiscount({ subtotal: 100, promo: PROMO_5, coupon: { code: 'X', percent: 0 } })
    ).toMatchObject({ reason: 'online' })
  })

  it('ignores a promotion that is switched off', () => {
    expect(resolveShopDiscount({ subtotal: 100, promo: PROMO_OFF })).toMatchObject({
      percent: 0,
      reason: null,
    })
  })

  describe('wholesale', () => {
    it('applies 25% to an approved account', () => {
      expect(
        resolveShopDiscount({ subtotal: 100, isWholesale: true, isWholesaleApproved: true })
      ).toMatchObject({ percent: 25, amount: 25, total: 75, reason: 'wholesale_25' })
    })

    it('gives an unapproved account nothing', () => {
      expect(
        resolveShopDiscount({ subtotal: 100, isWholesale: true, isWholesaleApproved: false })
      ).toMatchObject({ percent: 0, total: 100, reason: null })
    })

    // B2B pricing is its own thing: a retail coupon must not reach it, which is
    // also what the server does.
    it('never sees the promotion or a coupon', () => {
      expect(
        resolveShopDiscount({
          subtotal: 100,
          isWholesale: true,
          isWholesaleApproved: true,
          isMember: true,
          promo: { enabled: true, percent: 80 },
          coupon: { code: 'BIG', percent: 80 },
        })
      ).toMatchObject({ percent: 25, reason: 'wholesale_25' })
    })
  })

  describe('money', () => {
    it('rounds to cents', () => {
      // 33.33 * 5% = 1.6665
      expect(resolveShopDiscount({ subtotal: 33.33, promo: PROMO_5 }).amount).toBe(1.67)
    })

    it('never takes a discount off a negative or broken subtotal', () => {
      expect(resolveShopDiscount({ subtotal: -50, promo: PROMO_5 }).total).toBe(0)
      expect(resolveShopDiscount({ subtotal: Number.NaN, promo: PROMO_5 }).total).toBe(0)
    })
  })
})

describe('formatPercent', () => {
  it.each([
    [5, '5'],
    [10, '10'],
    [7.5, '7,5'],
  ])('%s renders as %s', (input, expected) => {
    expect(formatPercent(input)).toBe(expected)
  })
})

describe('applyShopPromo', () => {
  it('rewrites the list price as the online price', () => {
    expect(applyShopPromo(100, PROMO_5)).toEqual({ price: 95, listPrice: 100, percent: 5 })
  })

  // The page, the card and the Offer must show what the checkout charges for
  // one unit: subtotal minus the rounded discount, as order.service does.
  it.each([
    [199.9, 189.9],
    [99.9, 94.9],
    [69.9, 66.4],
    [119.9, 113.9],
    [349.9, 332.4],
    [89.9, 85.4],
    [19.9, 18.9],
    [599.9, 569.9],
    [9.9, 9.4],
    [125.9, 119.6],
  ])('prices %s at 5%% like the checkout: %s', (list, expected) => {
    expect(applyShopPromo(list, PROMO_5)?.price).toBe(expected)
    expect(applyShopPromo(list, PROMO_5)?.price).toBe(
      resolveShopDiscount({ subtotal: list, promo: PROMO_5 }).total
    )
  })

  it('returns null when there is no promotion, so callers keep their markup', () => {
    expect(applyShopPromo(100, PROMO_OFF)).toBeNull()
    expect(applyShopPromo(100, null)).toBeNull()
    expect(applyShopPromo(100, { enabled: true, percent: 0 })).toBeNull()
  })

  it('refuses a price it cannot discount', () => {
    expect(applyShopPromo(0, PROMO_5)).toBeNull()
    expect(applyShopPromo(Number.NaN, PROMO_5)).toBeNull()
  })

  // Same ceiling as the server: a settings row edited by hand cannot make the
  // storefront quote a negative price.
  it('caps a poisoned percentage at 90', () => {
    expect(applyShopPromo(100, { enabled: true, percent: 500 })).toEqual({
      price: 10,
      listPrice: 100,
      percent: 90,
    })
  })
})
