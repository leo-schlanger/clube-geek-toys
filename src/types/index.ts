// ============================================
// CLUBE GEEKPOP & TOYS - TYPE DEFINITIONS
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
  /** PIX aguardando confirmação. `null` limpa o campo (o PATCH aceita nullable). */
  pendingPayment?: PendingPaymentInfo | null
  paymentCount: number
  /**
   * Ativação manual pelo admin. O `updateMemberSchema` do backend já aceitava os
   * dois desde a revisão de 10/08/2026, mas o tipo do front nunca acompanhou —
   * `activateMember()` compilava só porque o `tsc -b` estava quebrado e o CI
   * usava `vite build`. Deixá-los aqui é o que mantém os dois lados de acordo.
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
  name: 'Clube GeekPop & Toys',
  price: 149.99,
  discount: 15,
  benefits: [
    '15% de desconto em qualquer produto',
    'Brinde especial de boas-vindas',
    'Entrada gratuita em eventos participantes',
  ],
  color: '#F04080',
  icon: '🎮',
}

// Mapa mantido para acessos por plano (o plano é sempre 'club').
export const PLANS: Record<PlanType, Plan> = {
  club: CLUB_PLAN,
}

// Desconto do membro na loja, como fração (uso de exibição no front — o valor
// real é sempre recalculado no backend). Ver server/api/src/types MEMBER_SHOP_DISCOUNT.
export const MEMBER_SHOP_DISCOUNT = 0.15

// Desconto atacadista (fração) — canal /atacado, conta CNPJ aprovada. Server-side only.
export const WHOLESALE_SHOP_DISCOUNT = 0.25

export type ShopChannel = 'retail' | 'wholesale'

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
  /** Chave do ícone (ver src/lib/category-icons.ts). */
  icon?: string | null
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
  /** Categoria principal (espelha product_categories position 0). */
  categoryId: string | null
  categoryName?: string | null
  /** Todas as categorias do produto, principal primeiro (até 5). */
  categoryIds?: string[]
  categoryNames?: string[]
  videos?: ProductVideo[]
  images: string[]
  stock: number
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
  /** Shopee-style: listing com variações */
  hasVariants?: boolean
  variantAxes?: VariantAxis[]
  variants?: ProductVariant[]
  priceFrom?: number | null
  stockTotal?: number | null
  createdAt: string
  updatedAt: string
}

/**
 * Vídeo do produto. `file` = MP4 no volume /uploads; os demais são links
 * externos que a loja embeda.
 */
export interface ProductVideo {
  kind: 'youtube' | 'instagram' | 'file'
  url: string
  title?: string
}

/** Eixo de variação (Cor, Tamanho, Material…). Sem limite de quantidade. */
export interface VariantAxis {
  name: string
  options: string[]
}

/** SKU de uma combinação de opções */
export interface ProductVariant {
  id: string
  productId: string
  name: string
  options: Record<string, string>
  sku: string | null
  price: number
  compareAtPrice: number | null
  stock: number
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
  /** SKU de variação (Shopee); undefined = produto simples */
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

// ─── Perfil de cliente (loja, sem assinatura) ────────────────────────────────

/**
 * Quem compra na loja sem assinar o clube. Não confundir com `Member`, que é o
 * registro da assinatura (exige CPF, tem plano e validade). Uma conta pode ter
 * perfil, assinatura, os dois, ou nenhum.
 */
export const GENDERS = [
  'feminino',
  'masculino',
  'nao_binario',
  'outro',
  'prefiro_nao_dizer',
] as const

export type Gender = (typeof GENDERS)[number]

/** Rótulos em pt-BR para os selects. */
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
  /** YYYY-MM-DD — sem hora, para fuso não mudar o dia do aniversário. */
  birthDate: string | null
  gender: Gender | null
  photoUrl: string | null
  address: ProfileAddress | null
  marketingConsent: boolean
  /** True quando a conta também assina o clube. */
  isMember: boolean
  createdAt: string | null
  updatedAt: string | null
}

/** Omitir a chave = não mexe. `null` = apagar o campo. */
export interface UpdateProfilePayload {
  fullName?: string | null
  phone?: string | null
  birthDate?: string | null
  gender?: Gender | null
  address?: ProfileAddress | null
  marketingConsent?: boolean
}

/** Produto salvo, com preço e estoque **atuais** — não os de quando salvou. */
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
