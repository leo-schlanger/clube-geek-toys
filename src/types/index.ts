// ============================================
// CLUBE GEEKPOP & TOYS - TYPE DEFINITIONS
// ============================================

// The club has a single plan
export type PlanType = 'club'

// Member status
export type MemberStatus = 'active' | 'pending' | 'inactive' | 'expired'

// Payment frequency. New signups are monthly; `annual` remains for members
// who already paid a year and still have time on the clock.
export type PaymentType = 'monthly' | 'annual'

export function paymentTypeLabel(type: PaymentType): 'Mensal' | 'Anual' {
  return type === 'annual' ? 'Anual' : 'Mensal'
}

export function paymentTypeSuffix(type: PaymentType): '/mês' | '/ano' {
  return type === 'annual' ? '/ano' : '/mês'
}

/**
 * Frequency of every new charge — signup, renewal or a pending payment picked
 * back up. A member row may still say `annual` while the year they paid runs
 * out; that never means the next charge is annual.
 */
export const CURRENT_PAYMENT_TYPE: PaymentType = 'monthly'

// Payment status
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'

// Payment method
export type PaymentMethod = 'pix' | 'credit_card' | 'boleto' | 'cash'

// User role
export type UserRole = 'member' | 'seller' | 'admin'

// ============================================
// MAIN INTERFACES
// ============================================

// Pending payment info (saved when PIX is generated)
export interface PendingPaymentInfo {
  paymentId: string
  qrCode: string
  amount: number
  expiresAt: string
  createdAt: string
}

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
  /** PIX awaiting confirmation. `null` clears it; the PATCH accepts nullable. */
  pendingPayment?: PendingPaymentInfo | null
  paymentCount: number
  /**
   * Manual activation by an admin. The backend schema accepted both fields
   * long before this type did: `activateMember()` only compiled because
   * `tsc -b` was broken and CI ran `vite build`. Declaring them keeps the two
   * sides in agreement.
   */
  activatedAt?: string | null
  activatedByPayment?: string | null
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
  price: number        // monthly price (BRL)
  discount: number     // % off any product
  benefits: string[]
  color: string
  icon: string
}

// ============================================
// PLANS CONFIGURATION
// ============================================

// Single monthly club plan.
export const CLUB_PLAN: Plan = {
  id: 'club',
  name: 'Clube GeekPop & Toys',
  price: 12.50,
  discount: 10,
  benefits: [
    '10% de desconto em qualquer produto',
    '50% de desconto nos ingressos dos eventos',
    'Brinde na primeira compra da loja',
  ],
  color: '#F04080',
  icon: '🎮',
}

// Kept for per-plan lookups, though the plan is always 'club'.
export const PLANS: Record<PlanType, Plan> = {
  club: CLUB_PLAN,
}

// Display only: the real figure is always recomputed server-side.
// See MEMBER_SHOP_DISCOUNT in server/api/src/types.
export const MEMBER_SHOP_DISCOUNT = 0.10

// Wholesale channel, approved CNPJ account. Applied server-side only.
export const WHOLESALE_SHOP_DISCOUNT = 0.25

export type ShopChannel = 'retail' | 'wholesale'

// ============================================
// SHOP / E-COMMERCE TYPES
// ============================================

export type OrderStatus = 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'

/** Correios vs counter pickup in Copacabana. */
export type DeliveryMethod = 'shipping' | 'pickup'
export type OrderPaymentMethod = 'pix' | 'credit_card'

export interface Category {
  id: string
  name: string
  slug: string
  description: string | null
  /** Icon key; see src/lib/category-icons.ts. */
  icon?: string | null
  active: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/** Admin category list includes inactive rows and a product count. */
export interface AdminCategory extends Category {
  productCount: number
}

export interface Product {
  id: string
  name: string
  slug: string
  description: string | null
  price: number
  compareAtPrice: number | null
  /** Primary category (product_categories position 0). */
  categoryId: string | null
  categoryName?: string | null
  /** Primary category first, up to 5. */
  categoryIds?: string[]
  categoryNames?: string[]
  videos?: ProductVideo[]
  images: string[]
  stock: number
  /** Units held by pending orders. */
  reserved?: number
  /** `stock - reserved`: what can be sold now. This is what the storefront uses. */
  available?: number
  /** Acquisition cost; null = not filled in (distinct from zero). */
  costPrice?: number | null
  sku: string | null
  active: boolean
  featured: boolean
  weightG?: number | null
  heightCm?: number | null
  widthCm?: number | null
  lengthCm?: number | null
  ratingAvg?: number
  ratingCount?: number
  wholesaleEnabled?: boolean
  wholesaleMinQty?: number
  hasVariants?: boolean
  variantAxes?: VariantAxis[]
  variants?: ProductVariant[]
  priceFrom?: number | null
  stockTotal?: number | null
  createdAt: string
  updatedAt: string
}

/**
 * `file` is an MP4 on the /uploads volume; the others are external links the
 * storefront embeds.
 */
export interface ProductVideo {
  kind: 'youtube' | 'instagram' | 'file'
  url: string
  title?: string
}

export interface VariantAxis {
  name: string
  options: string[]
}

export interface ProductVariant {
  id: string
  productId: string
  name: string
  options: Record<string, string>
  sku: string | null
  price: number
  compareAtPrice: number | null
  costPrice?: number | null
  stock: number
  reserved?: number
  available?: number
  images: string[]
  active: boolean
  sortOrder: number
  createdAt?: string
  updatedAt?: string
}

export type WholesaleStatus = 'pending' | 'approved' | 'rejected' | 'disabled'

export interface WholesaleAccount {
  id: string
  userId: string
  cnpj: string
  companyName: string
  tradeName: string | null
  stateRegistration: string | null
  phone: string | null
  contactName: string
  businessActivity: string | null
  status: WholesaleStatus
  rejectionReason: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  adminNotes: string | null
  email?: string
  createdAt: string
  updatedAt: string
}

export interface OrderItem {
  id: string
  orderId: string
  productId: string | null
  productName: string
  productSlug: string | null
  unitPrice: number
  quantity: number
  lineTotal: number
  imageUrl: string | null
}

export interface Order {
  id: string
  orderNumber: number
  memberId: string | null
  userId?: string | null
  customerName: string
  customerEmail: string
  customerPhone: string | null
  /** Free-text note from the buyer to the shop. */
  customerNote?: string | null
  /** `shipping` = Correios; `pickup` = counter in the store. */
  deliveryMethod?: DeliveryMethod
  shippingAddress: Record<string, unknown> | null
  subtotal: number
  discount: number
  discountReason: string | null
  shippingCost: number
  shippingService?: string | null
  shippingServiceId?: string | null
  shippingDays?: number | null
  trackingCode?: string | null
  trackingUrl?: string | null
  storeCreditApplied?: number
  channel?: ShopChannel
  customerCnpj?: string | null
  wholesaleAccountId?: string | null
  total: number
  status: OrderStatus
  paymentMethod: OrderPaymentMethod | null
  stripePaymentIntentId: string | null
  pixTxid: string | null
  /** Pending order PIX, so the QR can be recovered after a closed tab. */
  pixData?: PixQRData
  paidAt: string | null
  createdAt: string
  updatedAt: string
  items?: OrderItem[]
}

/** Abas de "Minhas compras" (UX marketplace). */
export type MyOrdersTab =
  | 'all'
  | 'to_pay'
  | 'preparing'
  | 'on_the_way'
  | 'finished'
  | 'cancelled'

export const MY_ORDERS_TAB_STATUSES: Record<MyOrdersTab, OrderStatus[] | null> = {
  all: null,
  to_pay: ['pending'],
  preparing: ['paid', 'processing'],
  on_the_way: ['shipped'],
  finished: ['delivered'],
  cancelled: ['cancelled', 'refunded'],
}

// PIX QR data from the backend: EMV code to render and to copy
export interface PixQRData {
  emvCode: string
  pixKey: string
  amount: number
  txId: string
  expiresAt: string
}

// Cart item, persisted in localStorage on the shop subdomain
export interface CartItem {
  productId: string
  /** Variant SKU; undefined means a plain product. */
  variantId?: string | null
  /** Ex.: "Rosa / M" */
  variantLabel?: string | null
  name: string
  slug: string
  price: number
  image: string | null
  quantity: number
  stock: number
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
}

// ============================================
// VERIFICATION TYPES
// ============================================

export interface MemberVerification {
  member: Member
  isValid: boolean
  message: string
  discount: number
}

// ============================================
// SUBSCRIPTION TYPES
// ============================================

// Subscription status
export type SubscriptionStatus = 'pending' | 'authorized' | 'paused' | 'cancelled'

// Subscription frequency
export type SubscriptionFrequencyType = 'months' | 'years'

// Subscription interface
export interface Subscription {
  id: string
  memberId: string
  providerId: string
  status: SubscriptionStatus
  plan: PlanType
  frequencyType: SubscriptionFrequencyType
  transactionAmount: number
  nextPaymentDate?: string             // Next charge date
  lastPaymentDate?: string             // Last successful payment
  failedPayments: number               // Counter of consecutive failures (max 3)
  cardLastFour?: string                // Last 4 digits of card
  cardBrand?: string                   // Visa, Mastercard, etc
  payerEmail: string
  createdAt: string
  cancelledAt?: string
  pausedAt?: string
}

// Subscription payment record (for payment history)
export interface SubscriptionPayment {
  id: string
  subscriptionId: string
  memberId: string
  amount: number
  status: 'approved' | 'rejected' | 'pending'
  paymentDate: string
  providerPaymentId: string
  failureReason?: string
}

// Create subscription request
export interface CreateSubscriptionRequest {
  memberId: string
  plan: PlanType
  frequencyType: SubscriptionFrequencyType
  payerEmail: string
  payerName: string
  encryptedCard: string
}

// Subscription management actions
export type SubscriptionAction = 'pause' | 'resume' | 'cancel' | 'update-card'

// Extended Member interface with subscription fields
export interface MemberWithSubscription extends Member {
  subscriptionId?: string
  subscriptionStatus?: SubscriptionStatus
  autoRenewal?: boolean
}

// ============================================
// CONTRACT TYPES
// ============================================

// Contract status
export type ContractStatus = 'active' | 'superseded'

// Contract data for digital signature
export interface ContractData {
  memberId: string
  memberName: string
  memberCPF: string
  memberEmail: string
  memberPhone: string
  plan: PlanType
  paymentType: PaymentType
  signatureImage: string      // Base64 PNG of signature
  signedAt: string            // ISO timestamp
  ipAddress: string
  userAgent: string
  documentHash: string        // SHA-256 hash
  pdfUrl?: string             // stored PDF URL
  pdfPath?: string            // stored PDF path on the server
  createdAt: string
}

// Contract document stored in PostgreSQL
export interface Contract {
  id: string
  memberId: string
  memberName: string
  memberCPF: string
  memberEmail: string
  plan: PlanType
  signaturePreview: string    // First 100 chars of base64 (for preview)
  signedAt: string
  ipAddress: string
  userAgent: string
  documentHash: string
  pdfUrl: string
  pdfPath: string
  status: ContractStatus
  createdAt: string
}

// ─── Customer profile (shop, no subscription) ────────────────────────────────

/**
 * Someone who buys without subscribing. Not to be confused with `Member`, the
 * subscription record, which requires a CPF and carries a plan and an expiry.
 * An account may have a profile, a membership, both, or neither.
 */
export const GENDERS = [
  'feminino',
  'masculino',
  'nao_binario',
  'outro',
  'prefiro_nao_dizer',
] as const

export type Gender = (typeof GENDERS)[number]

/** pt-BR labels for the selects. */
export const GENDER_LABELS: Record<Gender, string> = {
  feminino: 'Feminino',
  masculino: 'Masculino',
  nao_binario: 'Não binário',
  outro: 'Outro',
  prefiro_nao_dizer: 'Prefiro não dizer',
}

export interface ProfileAddress {
  cep: string
  street: string
  number: string
  complement?: string
  neighborhood: string
  city: string
  state: string
}

export interface CustomerProfile {
  userId: string
  email: string
  fullName: string | null
  phone: string | null
  /** YYYY-MM-DD, no time, so a timezone cannot shift the birthday. */
  birthDate: string | null
  gender: Gender | null
  photoUrl: string | null
  address: ProfileAddress | null
  marketingConsent: boolean
  /** True when the account also holds a membership. */
  isMember: boolean
  createdAt: string | null
  updatedAt: string | null
}

/** Omitting a key leaves it alone; `null` clears the field. */
export interface UpdateProfilePayload {
  fullName?: string | null
  phone?: string | null
  birthDate?: string | null
  gender?: Gender | null
  address?: ProfileAddress | null
  marketingConsent?: boolean
}

/** Price and stock are the **current** ones, not those at save time. */
export interface SavedProduct {
  productId: string
  name: string
  slug: string
  price: number
  imageUrl: string | null
  active: boolean
  stock: number
  savedAt: string
}
