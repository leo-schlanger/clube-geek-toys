// Shared types — mirrors frontend src/types/index.ts

export type PlanType = 'club';
export type MemberStatus = 'active' | 'pending' | 'inactive' | 'expired';
export type PaymentType = 'monthly' | 'annual';
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

// Club monthly plan price (BRL). Must match frontend CLUB_PLAN.price.
export const CLUB_PLAN_PRICE = 12.50;

// Billing frequency of every new charge, in the three vocabularies that need
// it: `members.payment_type`, `subscriptions.frequency_type` and the Stripe
// price interval. `annual` survives only on member rows that still have time
// left on a year already paid for.
export const CLUB_PLAN_PAYMENT_TYPE: PaymentType = 'monthly';
export const CLUB_PLAN_FREQUENCY_TYPE: SubscriptionFrequencyType = 'months';
export const CLUB_PLAN_INTERVAL: 'month' | 'year' = 'month';

// Active-member shop discount, applied server-side at checkout.
export const MEMBER_SHOP_DISCOUNT = 0.10;
export const MEMBER_DISCOUNT_REASON = 'member_10';

// Approved wholesale discount. Wholesale channel only; never stacks with member_10.
export const WHOLESALE_SHOP_DISCOUNT = 0.25;

export type ShopChannel = 'retail' | 'wholesale';

/** How the order reaches the customer: Correios or the counter in Copacabana. */
export type DeliveryMethod = 'shipping' | 'pickup';

// ─── Shop / e-commerce ────────────────────────────────────────────────────────

export type OrderStatus = 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
export type OrderPaymentMethod = 'pix' | 'credit_card';

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  /** Icon key; see src/lib/category-icons.ts. */
  icon?: string | null;
  active: boolean;
  sortOrder: number;
  /** Parent category, or null for a top-level one. The tree is one level deep. */
  parentId?: string | null;
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
  /** Primary category (product_categories position 0). */
  categoryId: string | null;
  categoryName?: string | null;
  /** Primary category first, up to MAX_PRODUCT_CATEGORIES. */
  categoryIds?: string[];
  categoryNames?: string[];
  videos?: ProductVideo[];
  images: string[];
  stock: number;
  /** Units already held by pending orders (migration 021). */
  reserved: number;
  /** `stock - reserved`: what the storefront can actually sell. */
  available: number;
  /** Acquisition cost; NULL = not filled in, distinct from zero (migration 022). */
  costPrice: number | null;
  sku: string | null;
  active: boolean;
  featured: boolean;
  weightG?: number | null;
  heightCm?: number | null;
  widthCm?: number | null;
  lengthCm?: number | null;
  ratingAvg?: number;
  ratingCount?: number;
  /** Available on the wholesale channel. */
  wholesaleEnabled?: boolean;
  /** Minimum wholesale quantity per SKU. */
  wholesaleMinQty?: number;
  hasVariants?: boolean;
  /** e.g. [{ name: "Cor", options: ["Rosa", "Preto"] }] */
  variantAxes?: VariantAxis[];
  /** Only populated on the detail and admin views when hasVariants. */
  variants?: ProductVariant[];
  /** Lowest price across active variants, shown on the storefront. */
  priceFrom?: number | null;
  /** Summed stock of active variants. */
  stockTotal?: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * `file` is an MP4 on the /uploads volume; the others are external links the
 * storefront embeds.
 */
export interface ProductVideo {
  kind: 'youtube' | 'instagram' | 'file';
  url: string;
  title?: string;
}

export interface VariantAxis {
  name: string;
  options: string[];
}

export interface ProductVariant {
  id: string;
  productId: string;
  name: string;
  options: Record<string, string>;
  sku: string | null;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  /** Units already held by pending orders (migration 021). */
  reserved: number;
  /** `stock - reserved`: what the storefront can actually sell. */
  available: number;
  /** Acquisition cost; NULL = not filled in, distinct from zero (migration 022). */
  costPrice: number | null;
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

/** PIX EMV returned by the API — same shape as `utils/pix.ts`. */
export interface PixQRData {
  emvCode: string;
  pixKey: string;
  amount: number;
  txId: string;
  expiresAt: string;
}

export interface Order {
  id: string;
  orderNumber: number;
  memberId: string | null;
  userId?: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  /** Free-text note the customer left for the shop at checkout. */
  customerNote?: string | null;
  /** 'shipping' = Correios; 'pickup' = customer collects at the counter. */
  deliveryMethod: DeliveryMethod;
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
  /** Legacy: set only on orders charged before the Pagar.me migration. */
  stripePaymentIntentId: string | null;
  pagarmeOrderId?: string | null;
  pagarmeChargeId?: string | null;
  /** The Pagar.me customer a PSP card charge bills against. */
  pagarmeCustomerId?: string | null;
  /** 'pagarme' | 'stripe' | 'manual' — who holds the charge. */
  paymentProvider?: string | null;
  pixTxid: string | null;
  /** The card that paid, for the admin's order view. */
  cardBrand?: string | null;
  cardLastFour?: string | null;
  installments?: number | null;
  /** CPF/CNPJ of the buyer, required by the acquirer. Digits only. */
  customerDocument?: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  items?: OrderItem[];
  /** Only on a `pending` order; never returned for a paid one. */
  pixData?: PixQRData;
}
