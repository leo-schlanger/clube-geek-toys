import { api, unwrapApi, unwrapApiVoid } from './api-client'

/** The online-channel promotion, as the storefront sees it. */
export interface ShopPromo {
  enabled: boolean
  /** Percentage points, 0–90. */
  percent: number
  bannerEnabled: boolean
  bannerText: string
}

export const PROMO_OFF: ShopPromo = {
  enabled: false,
  percent: 0,
  bannerEnabled: false,
  bannerText: '',
}

/**
 * Public: the promotion and its announcement.
 *
 * Falls back to "no promotion" rather than throwing. A shop that cannot reach
 * this endpoint must still sell at list price; the server prices the order
 * anyway, so the worst case is a customer who is pleasantly surprised at
 * checkout, not one who is overcharged.
 */
export async function getShopPromo(): Promise<ShopPromo> {
  const result = await api.get<ShopPromo>('/promo', { skipAuth: true })
  return result.data ?? PROMO_OFF
}

export type CouponCheck =
  | { valid: true; code: string; percent: number; description: string | null }
  | { valid: false; code: string; message: string }

/**
 * Public: "does this code work, and for how much?"
 *
 * Advisory only. The order is priced again server-side and the use is taken
 * there, so a code that passes here can still be refused at checkout if
 * somebody else spent the last one in between.
 */
export async function checkCoupon(
  code: string,
  subtotal: number,
  email?: string | null
): Promise<CouponCheck> {
  const result = await api.post<CouponCheck>(
    '/promo/coupon-check',
    { code, subtotal, email: email || undefined },
    { skipAuth: true }
  )
  return (
    result.data ?? {
      valid: false,
      code: 'NETWORK',
      message: result.error || 'Não foi possível conferir o cupom agora.',
    }
  )
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export interface Coupon {
  id: string
  code: string
  description: string | null
  percent: number
  active: boolean
  startsAt: string | null
  endsAt: string | null
  maxUses: number | null
  usedCount: number
  maxUsesPerCustomer: number | null
  minSubtotal: number | null
  createdAt: string
  updatedAt: string
}

export interface CouponInput {
  code: string
  description?: string | null
  percent: number
  active?: boolean
  startsAt?: string | null
  endsAt?: string | null
  maxUses?: number | null
  maxUsesPerCustomer?: number | null
  minSubtotal?: number | null
}

/** Mirrors `MAX_COUPON_CODE_LENGTH` — the cap that keeps `discount_reason` intact. */
export const MAX_COUPON_CODE_LENGTH = 20

export async function listCoupons(): Promise<Coupon[]> {
  const result = await api.get<{ coupons: Coupon[] }>('/promo/coupons')
  return result.data?.coupons ?? []
}

export async function createCoupon(data: CouponInput): Promise<Coupon> {
  const result = await api.post<Coupon>(
    '/promo/coupons',
    data as unknown as Record<string, unknown>,
    { noRetry: true, timeoutMs: 60_000 }
  )
  return unwrapApi(result, 'Não foi possível criar o cupom.')
}

export async function updateCoupon(id: string, data: Partial<CouponInput>): Promise<Coupon> {
  const result = await api.patch<Coupon>(
    `/promo/coupons/${id}`,
    data as unknown as Record<string, unknown>,
    { noRetry: true, timeoutMs: 60_000 }
  )
  return unwrapApi(result, 'Não foi possível salvar o cupom.')
}

export async function deactivateCoupon(id: string): Promise<void> {
  const result = await api.delete(`/promo/coupons/${id}`, { noRetry: true, timeoutMs: 60_000 })
  unwrapApiVoid(result, 'Não foi possível desativar o cupom.')
}
