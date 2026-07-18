// ============================================
// CLUBE GEEK & TOYS - TYPE DEFINITIONS
// ============================================

// Plano único do clube
export type PlanType = 'club'

// Member status
export type MemberStatus = 'active' | 'pending' | 'inactive' | 'expired'

// Payment frequency — o clube é anual
export type PaymentType = 'annual'

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
  pendingPayment?: PendingPaymentInfo // PIX payment waiting for confirmation
  paymentCount: number
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
  price: number        // preço anual (BRL)
  discount: number     // % de desconto em qualquer produto
  benefits: string[]
  color: string
  icon: string
}

// ============================================
// PLANS CONFIGURATION
// ============================================

// Plano único e anual do clube.
export const CLUB_PLAN: Plan = {
  id: 'club',
  name: 'Clube Geek & Toys',
  price: 149.99,
  discount: 15,
  benefits: [
    '15% de desconto em qualquer produto',
    'Brinde especial de boas-vindas',
    'Entrada gratuita em eventos participantes',
  ],
  color: '#7c3aed',
  icon: '🎮',
}

// Mapa mantido para acessos por plano (o plano é sempre 'club').
export const PLANS: Record<PlanType, Plan> = {
  club: CLUB_PLAN,
}

// Desconto do membro na loja, como fração (uso de exibição no front — o valor
// real é sempre recalculado no backend). Ver server/api/src/types MEMBER_SHOP_DISCOUNT.
export const MEMBER_SHOP_DISCOUNT = 0.15

// ============================================
// SHOP / E-COMMERCE TYPES
// ============================================

export type OrderStatus = 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'
export type OrderPaymentMethod = 'pix' | 'credit_card'

export interface Category {
  id: string
  name: string
  slug: string
  description: string | null
  active: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface Product {
  id: string
  name: string
  slug: string
  description: string | null
  price: number
  compareAtPrice: number | null
  categoryId: string | null
  categoryName?: string | null
  images: string[]
  stock: number
  sku: string | null
  active: boolean
  featured: boolean
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
  customerName: string
  customerEmail: string
  customerPhone: string | null
  shippingAddress: Record<string, unknown> | null
  subtotal: number
  discount: number
  discountReason: string | null
  shippingCost: number
  total: number
  status: OrderStatus
  paymentMethod: OrderPaymentMethod | null
  stripePaymentIntentId: string | null
  pixTxid: string | null
  paidAt: string | null
  createdAt: string
  updatedAt: string
  items?: OrderItem[]
}

// Dados do QR PIX retornados pelo backend (EMV code para renderizar/copiar)
export interface PixQRData {
  emvCode: string
  pixKey: string
  amount: number
  txId: string
  expiresAt: string
}

// Item do carrinho (persistido em localStorage no subdomínio da loja)
export interface CartItem {
  productId: string
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
  pdfUrl?: string             // URL do PDF armazenado no servidor
  pdfPath?: string            // Caminho do arquivo no servidor
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
