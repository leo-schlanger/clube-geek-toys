// ============================================
// CLUBE GEEK & TOYS - TYPE DEFINITIONS
// ============================================

// Available plans
export type PlanType = 'silver' | 'gold' | 'black'

// Member status
export type MemberStatus = 'active' | 'pending' | 'inactive' | 'expired'

// Payment frequency
export type PaymentType = 'monthly' | 'annual'

// Payment status
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'

// Payment method
export type PaymentMethod = 'pix' | 'credit_card' | 'boleto' | 'cash'

// User role
export type UserRole = 'member' | 'seller' | 'admin'

// ============================================
// MAIN INTERFACES
// ============================================

export interface Member {
  id: string
  userId: string
  cpf: string
  fullName: string
  email: string
  phone: string
  photoUrl?: string
  plan: PlanType
  status: MemberStatus
  paymentType: PaymentType
  startDate: string
  expiryDate: string
  points: number
  createdAt: string
  updatedAt: string
}

export interface User {
  id: string
  email: string
  role: UserRole
  createdAt: string
}

export interface Payment {
  id: string
  memberId: string
  amount: number
  method: PaymentMethod
  status: PaymentStatus
  reference?: string
  paidAt?: string
  createdAt: string
}

export interface Plan {
  id: PlanType
  name: string
  priceMonthly: number
  priceAnnual: number
  discountProducts: number
  discountServices: number
  benefits: string[]
  color: string
  icon: string
}

// ============================================
// PLANS CONFIGURATION
// ============================================

export const PLANS: Record<PlanType, Plan> = {
  silver: {
    id: 'silver',
    name: 'Silver',
    priceMonthly: 19.90,
    priceAnnual: 199.90,
    discountProducts: 10,
    discountServices: 20,
    benefits: [
      '10% de desconto em produtos',
      '20% de desconto em serviços',
      'Participação em 1 sorteio mensal',
      'Acesso à área de membros',
    ],
    color: '#94a3b8',
    icon: '🥉',
  },
  gold: {
    id: 'gold',
    name: 'Gold',
    priceMonthly: 39.90,
    priceAnnual: 399.90,
    discountProducts: 15,
    discountServices: 35,
    benefits: [
      '15% de desconto em produtos',
      '35% de desconto em serviços',
      'Brinde surpresa mensal',
      'Pontos em dobro',
      'Participação em sorteios exclusivos',
      'Acesso antecipado a promoções',
    ],
    color: '#fbbf24',
    icon: '🥈',
  },
  black: {
    id: 'black',
    name: 'Black',
    priceMonthly: 49.90,
    priceAnnual: 499.90,
    discountProducts: 20,
    discountServices: 50,
    benefits: [
      '20% de desconto em produtos',
      '50% de desconto em serviços',
      'Acesso antecipado a lançamentos',
      'Brinde premium mensal',
      'Pontos em triplo',
      'Atendimento VIP',
      'Convites para eventos exclusivos',
    ],
    color: '#1f2937',
    icon: '🥇',
  },
}

// ============================================
// FORM DATA TYPES
// ============================================

export interface MemberFormData {
  cpf: string
  fullName: string
  email: string
  phone: string
  plan: PlanType
  paymentType: PaymentType
}

export interface LoginFormData {
  email: string
  password: string
}

export interface RegisterFormData {
  email: string
  password: string
  confirmPassword: string
}

// ============================================
// DASHBOARD TYPES
// ============================================

export interface DashboardStats {
  totalMembers: number
  activeMembers: number
  pendingPayments: number
  monthlyRevenue: number
  membersByPlan: {
    silver: number
    gold: number
    black: number
  }
}

// ============================================
// VERIFICATION TYPES
// ============================================

export interface MemberVerification {
  member: Member
  isValid: boolean
  message: string
  discountProducts: number
  discountServices: number
}

// ============================================
// POINTS SYSTEM TYPES
// ============================================

// Point transaction type
export type PointTransactionType = 'earn' | 'redeem' | 'expire'

export interface PointTransaction {
  id: string
  memberId: string
  type: PointTransactionType
  points: number // positive for earn, negative for redeem/expire
  balance: number // balance after transaction
  description: string
  purchaseValue?: number // purchase value in BRL (for earn)
  expiresAt?: string // expiration date (only for earn)
  isPromotion?: boolean // if it was a promotional purchase (no points)
  createdAt: string
  createdBy?: string // seller ID who added points
}

export interface RedemptionRule {
  points: number
  value: number // in BRL
  description: string
}

export interface PointsConfig {
  pointsPerReal: number // 1 point per real
  expirationMonths: number // 6 months
  redemptionRules: RedemptionRule[]
}

// Default points configuration
export const POINTS_CONFIG: PointsConfig = {
  pointsPerReal: 1,
  expirationMonths: 6,
  redemptionRules: [
    { points: 500, value: 25, description: 'R$ 25 de desconto' },
    { points: 800, value: 50, description: 'R$ 50 de desconto' },
    { points: 1500, value: 100, description: 'R$ 100 de desconto' },
  ],
}

// Points multiplier by plan
export const POINTS_MULTIPLIER: Record<PlanType, number> = {
  silver: 1,
  gold: 2,
  black: 3,
}
