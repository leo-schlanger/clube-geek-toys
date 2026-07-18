import { describe, it, expect } from 'vitest'
import { CLUB_PLAN, PLANS, MEMBER_SHOP_DISCOUNT } from './index'
import type { PlanType, MemberStatus, PaymentType, PaymentStatus, PaymentMethod, UserRole } from './index'

// ============================================
// PLANS CONFIGURATION
// ============================================

describe('PLANS', () => {
  it('deve ter exatamente um plano: club', () => {
    const keys = Object.keys(PLANS)
    expect(keys).toHaveLength(1)
    expect(keys).toContain('club')
  })

  it('PLANS.club deve apontar para CLUB_PLAN', () => {
    expect(PLANS.club).toBe(CLUB_PLAN)
  })
})

describe('CLUB_PLAN', () => {
  it('deve ter id e nome corretos', () => {
    expect(CLUB_PLAN.id).toBe('club')
    expect(CLUB_PLAN.name).toBe('Clube Geek & Toys')
  })

  it('deve ter preço anual de 149.99', () => {
    expect(CLUB_PLAN.price).toBe(149.99)
  })

  it('deve ter desconto de 15%', () => {
    expect(CLUB_PLAN.discount).toBe(15)
  })

  it('deve ter três benefícios', () => {
    expect(CLUB_PLAN.benefits).toBeInstanceOf(Array)
    expect(CLUB_PLAN.benefits).toHaveLength(3)
  })

  it('deve ter cor e ícone', () => {
    expect(typeof CLUB_PLAN.color).toBe('string')
    expect(CLUB_PLAN.color).toBeTruthy()
    expect(typeof CLUB_PLAN.icon).toBe('string')
    expect(CLUB_PLAN.icon).toBeTruthy()
  })

  it('deve ter todos os campos obrigatórios', () => {
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
  it('deve ser 0.15 (15% como fração)', () => {
    expect(MEMBER_SHOP_DISCOUNT).toBe(0.15)
  })

  it('deve corresponder ao desconto do CLUB_PLAN', () => {
    expect(MEMBER_SHOP_DISCOUNT * 100).toBeCloseTo(CLUB_PLAN.discount, 5)
  })
})

// ============================================
// TYPE COMPATIBILITY (compile-time checks exercised at runtime)
// ============================================

describe('type compatibility', () => {
  it('valores de PlanType devem corresponder às chaves de PLANS', () => {
    const planTypes: PlanType[] = ['club']
    for (const pt of planTypes) {
      expect(PLANS[pt]).toBeDefined()
    }
  })

  it('valores de MemberStatus são strings válidas', () => {
    const statuses: MemberStatus[] = ['active', 'pending', 'inactive', 'expired']
    expect(statuses).toHaveLength(4)
  })

  it('valores de PaymentType são strings válidas', () => {
    const types: PaymentType[] = ['annual']
    expect(types).toHaveLength(1)
  })

  it('valores de PaymentStatus são strings válidas', () => {
    const statuses: PaymentStatus[] = ['pending', 'paid', 'failed', 'refunded']
    expect(statuses).toHaveLength(4)
  })

  it('valores de PaymentMethod são strings válidas', () => {
    const methods: PaymentMethod[] = ['pix', 'credit_card', 'boleto', 'cash']
    expect(methods).toHaveLength(4)
  })

  it('valores de UserRole são strings válidas', () => {
    const roles: UserRole[] = ['member', 'seller', 'admin']
    expect(roles).toHaveLength(3)
  })
})
