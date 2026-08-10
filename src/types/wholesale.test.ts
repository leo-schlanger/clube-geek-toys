import { describe, it, expect } from 'vitest'
import { MEMBER_SHOP_DISCOUNT, WHOLESALE_SHOP_DISCOUNT, CLUB_PLAN } from './index'

describe('shop discount constants', () => {
  it('member 15% and wholesale 25%', () => {
    expect(MEMBER_SHOP_DISCOUNT).toBe(0.15)
    expect(WHOLESALE_SHOP_DISCOUNT).toBe(0.25)
    expect(CLUB_PLAN.discount).toBe(15)
  })

  it('wholesale is higher than member', () => {
    expect(WHOLESALE_SHOP_DISCOUNT).toBeGreaterThan(MEMBER_SHOP_DISCOUNT)
  })
})
