import { describe, it, expect } from 'vitest'
import { CLUB_PLAN, PLANS, MEMBER_SHOP_DISCOUNT } from './index'
import type { PlanType, MemberStatus, PaymentType, PaymentStatus, PaymentMethod, UserRole } from './index'

// ============================================
// PLANS CONFIGURATION
// ============================================

describe('PLANS', () => {
  it('has exactly one plan: club', () => {
    const keys = Object.keys(PLANS)
    expect(keys).toHaveLength(1)
    expect(keys).toContain('club')
  })

  it('PLANS.club deve apontar para CLUB_PLAN', () => {
    expect(PLANS.club).toBe(CLUB_PLAN)
  })
})

describe('CLUB_PLAN', () => {
  it('has the correct id and name', () => {
    expect(CLUB_PLAN.id).toBe('club')
    expect(CLUB_PLAN.name).toBe('Clube GeekPop & Toys')
  })

  it('has an annual price of 149.99', () => {
    expect(CLUB_PLAN.price).toBe(149.99)
  })

  it('has a 15% discount', () => {
    expect(CLUB_PLAN.discount).toBe(15)
  })

  it('has three benefits', () => {
    expect(CLUB_PLAN.benefits).toBeInstanceOf(Array)
    expect(CLUB_PLAN.benefits).toHaveLength(3)
  })

  it('has a colour and an icon', () => {
    expect(typeof CLUB_PLAN.color).toBe('string')
    expect(CLUB_PLAN.color).toBeTruthy()
    expect(typeof CLUB_PLAN.icon).toBe('string')
    expect(CLUB_PLAN.icon).toBeTruthy()
  })

  it('has every required field', () => {
    expect(CLUB_PLAN.id).toBe('club')
    expect(typeof CLUB_PLAN.name).toBe('string')
    expect(typeof CLUB_PLAN.price).toBe('number')
    expect(typeof CLUB_PLAN.discount).toBe('number')
    expect(Array.isArray(CLUB_PLAN.benefits)).toBe(true)
    expect(typeof CLUB_PLAN.color).toBe('string')
    expect(typeof CLUB_PLAN.icon).toBe('string')
  })
})

// ============================================
// MEMBER SHOP DISCOUNT
// ============================================

describe('MEMBER_SHOP_DISCOUNT', () => {
  it('is 0.15, i.e. 15% as a fraction', () => {
    expect(MEMBER_SHOP_DISCOUNT).toBe(0.15)
  })

  it('matches the CLUB_PLAN discount', () => {
    expect(MEMBER_SHOP_DISCOUNT * 100).toBeCloseTo(CLUB_PLAN.discount, 5)
  })
})

// ============================================
// TYPE COMPATIBILITY (compile-time checks exercised at runtime)
// ============================================

describe('type compatibility', () => {
  it('PlanType values match the PLANS keys', () => {
    const planTypes: PlanType[] = ['club']
    for (const pt of planTypes) {
      expect(PLANS[pt]).toBeDefined()
    }
  })

  it('MemberStatus values are valid strings', () => {
    const statuses: MemberStatus[] = ['active', 'pending', 'inactive', 'expired']
    expect(statuses).toHaveLength(4)
  })

  it('PaymentType values are valid strings', () => {
    const types: PaymentType[] = ['annual']
    expect(types).toHaveLength(1)
  })

  it('PaymentStatus values are valid strings', () => {
    const statuses: PaymentStatus[] = ['pending', 'paid', 'failed', 'refunded']
    expect(statuses).toHaveLength(4)
  })

  it('PaymentMethod values are valid strings', () => {
    const methods: PaymentMethod[] = ['pix', 'credit_card', 'boleto', 'cash']
    expect(methods).toHaveLength(4)
  })

  it('UserRole values are valid strings', () => {
    const roles: UserRole[] = ['member', 'seller', 'admin']
    expect(roles).toHaveLength(3)
  })
})
