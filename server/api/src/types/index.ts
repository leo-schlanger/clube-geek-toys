// Shared types — mirrors frontend src/types/index.ts

export type PlanType = 'club';
export type MemberStatus = 'active' | 'pending' | 'inactive' | 'expired';
export type PaymentType = 'annual';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type PaymentMethod = 'pix' | 'credit_card' | 'boleto' | 'cash';
export type UserRole = 'member' | 'seller' | 'admin' | 'disabled';
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
  pendingPayment: Record<string, unknown> | null;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  autoRenewal: boolean;
  activatedAt: string | null;
  activatedByPayment: string | null;
  paymentCount: number;
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

// Preço do plano único anual do clube (BRL).
// MUST match frontend CLUB_PLAN.price in src/types/index.ts
export const CLUB_PLAN_PRICE = 149.99;

// Desconto do membro ativo na loja (fração). Aplicado server-side no checkout.
export const MEMBER_SHOP_DISCOUNT = 0.15;

// Desconto atacadista aprovado (fração). Canal wholesale apenas; não empilha com member_15.
export const WHOLESALE_SHOP_DISCOUNT = 0.25;

export type ShopChannel = 'retail' | 'wholesale';

// ─── Shop / e-commerce ────────────────────────────────────────────────────────

export type OrderStatus = 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
export type OrderPaymentMethod = 'pix' | 'credit_card';

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  compareAtPrice: number | null;
  categoryId: string | null;
  categoryName?: string | null;
  images: string[];
  stock: number;
  sku: string | null;
  active: boolean;
  featured: boolean;
  weightG?: number | null;
  heightCm?: number | null;
  widthCm?: number | null;
  lengthCm?: number | null;
  ratingAvg?: number;
  ratingCount?: number;
  /** Disponível no canal atacado (aba /atacado). Default false — pronto antes da importação. */
  wholesaleEnabled?: boolean;
  /** Quantidade mínima por SKU no atacado. */
  wholesaleMinQty?: number;
  /** Modelo Shopee: listing com variações (cor/tamanho…). */
  hasVariants?: boolean;
  /** Eixos de variação: max 2, ex. [{ name: "Cor", options: ["Rosa","Preto"] }] */
  variantAxes?: VariantAxis[];
  /** Preenchido no detalhe/admin quando hasVariants. */
  variants?: ProductVariant[];
  /** Preço mínimo entre variantes ativas (vitrine). */
  priceFrom?: number | null;
  /** Estoque somado das variantes ativas. */
  stockTotal?: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Eixo de variação (Shopee: 1º tipo / 2º tipo). Max 2 por produto. */
export interface VariantAxis {
  name: string;
  options: string[];
}

/** SKU vendável de um listing com variações. */
export interface ProductVariant {
  id: string;
  productId: string;
  name: string;
  options: Record<string, string>;
  sku: string | null;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  images: string[];
  active: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string | null;
  productName: string;
  productSlug: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  imageUrl: string | null;
  variantId?: string | null;
  variantLabel?: string | null;
}

export interface Order {
  id: string;
  orderNumber: number;
  memberId: string | null;
  userId?: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  shippingAddress: Record<string, unknown> | null;
  subtotal: number;
  discount: number;
  discountReason: string | null;
  shippingCost: number;
  shippingService?: string | null;
  shippingServiceId?: string | null;
  shippingDays?: number | null;
  trackingCode?: string | null;
  trackingUrl?: string | null;
  storeCreditApplied?: number;
  channel?: ShopChannel;
  customerCnpj?: string | null;
  wholesaleAccountId?: string | null;
  total: number;
  status: OrderStatus;
  paymentMethod: OrderPaymentMethod | null;
  stripePaymentIntentId: string | null;
  pixTxid: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  items?: OrderItem[];
}
