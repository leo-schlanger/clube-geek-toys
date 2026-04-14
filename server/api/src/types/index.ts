// Shared types — mirrors frontend src/types/index.ts

export type PlanType = 'silver' | 'gold' | 'black';
export type MemberStatus = 'active' | 'pending' | 'inactive' | 'expired';
export type PaymentType = 'monthly' | 'annual';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type PaymentMethod = 'pix' | 'credit_card' | 'boleto' | 'cash';
export type UserRole = 'member' | 'seller' | 'admin' | 'disabled';
export type PointTransactionType = 'earn' | 'redeem' | 'expire' | 'bonus';
export type SubscriptionStatus = 'pending' | 'authorized' | 'paused' | 'cancelled';
export type SubscriptionFrequencyType = 'months' | 'years';
export type ContractStatus = 'active' | 'superseded';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Member {
  id: string;
  userId: string;
  cpf: string;
  fullName: string;
  email: string;
  phone: string | null;
  photoUrl: string | null;
  plan: PlanType;
  status: MemberStatus;
  paymentType: PaymentType;
  startDate: string | null;
  expiryDate: string | null;
  points: number;
  pendingPayment: Record<string, unknown> | null;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  autoRenewal: boolean;
  activatedAt: string | null;
  activatedByPayment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  memberId: string | null;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  providerId: string | null;
  providerStatus: string | null;
  reference: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface PointTransaction {
  id: string;
  memberId: string;
  type: PointTransactionType;
  points: number;
  balance: number;
  description: string | null;
  purchaseValue: number | null;
  expiresAt: string | null;
  expired: boolean;
  isPromotion: boolean;
  createdBy: string | null;
  createdAt: string;
}

export interface Subscription {
  id: string;
  memberId: string;
  providerId: string;
  status: SubscriptionStatus;
  plan: PlanType;
  frequencyType: SubscriptionFrequencyType;
  transactionAmount: number;
  nextPaymentDate: string | null;
  lastPaymentDate: string | null;
  failedPayments: number;
  cardLastFour: string | null;
  cardBrand: string | null;
  payerEmail: string | null;
  createdAt: string;
  cancelledAt: string | null;
  pausedAt: string | null;
}

export interface Contract {
  id: string;
  memberId: string;
  memberName: string;
  memberCpf: string;
  memberEmail: string;
  plan: PlanType;
  signaturePreview: string | null;
  signedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  documentHash: string | null;
  pdfUrl: string | null;
  pdfPath: string | null;
  status: ContractStatus;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  action: string;
  memberId: string | null;
  userId: string | null;
  details: Record<string, unknown>;
  timestamp: string;
}

// Plan pricing
// MUST match frontend PLANS in src/types/index.ts
export const PLAN_PRICES = {
  silver: { monthly: 19.90, annual: 199.90 },
  gold: { monthly: 39.90, annual: 399.90 },
  black: { monthly: 49.90, annual: 499.90 },
} as const;

// Points multiplier by plan
export const POINTS_MULTIPLIER = {
  silver: 1,
  gold: 2,
  black: 3,
} as const;

// Points expiration in months
export const POINTS_EXPIRY_MONTHS = 6;

// Valid redemption rules (enforced server-side)
export const REDEMPTION_RULES = [
  { points: 500, value: 25, description: 'R$ 25 de desconto' },
  { points: 800, value: 50, description: 'R$ 50 de desconto' },
  { points: 1500, value: 100, description: 'R$ 100 de desconto' },
] as const;
