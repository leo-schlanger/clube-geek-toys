import pg from 'pg';
import { query } from '../config/database.js';
import { AppError } from '../middleware/error-handler.js';
import { getSetting } from './settings.service.js';
import { MEMBER_SHOP_DISCOUNT, MEMBER_DISCOUNT_REASON } from '../types/index.js';

/**
 * Shop promotions: the online-channel discount and the coupon codes.
 *
 * ## Only one discount is ever applied
 *
 * `orders` carries a single `discount` and a single `discount_reason`, and the
 * wholesale channel already worked as "25% instead of, never on top of, the
 * member 10%". This keeps that invariant: member, online promotion and coupon
 * are three *candidates* and the largest one wins. Nothing stacks, so the
 * customer always pays the best price on offer and the panel can still explain
 * any order's price with one short string.
 *
 * Store credit is not a candidate — it is money the customer already owns, and
 * it is applied on top of whichever discount won (see `order.service`).
 */

/** Longest code that survives `orders.discount_reason` (VARCHAR(40)). */
export const MAX_COUPON_CODE_LENGTH = 20;

export const ONLINE_DISCOUNT_REASON = 'online';

export function couponReason(code: string): string {
  return `coupon_${code.toUpperCase()}`;
}

// ─── Public promotion config ─────────────────────────────────────────────────

export interface ShopPromo {
  /** Whether the online discount is being applied to orders right now. */
  enabled: boolean;
  /** 0–90. Meaningless when `enabled` is false. */
  percent: number;
  /** Whether the storefront should show the announcement bar. */
  bannerEnabled: boolean;
  bannerText: string;
}

/**
 * A percent that cannot poison the money math.
 *
 * The settings table is free-form JSONB, so a bad value can be saved by hand
 * (or by a future bug) and would otherwise reach `subtotal * percent`.
 */
function safePercent(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(90, n);
}

export async function getShopPromo(): Promise<ShopPromo> {
  const [enabled, percent, bannerEnabled, bannerText] = await Promise.all([
    getSetting<boolean>('shop.online_discount_enabled'),
    getSetting<number>('shop.online_discount_percent'),
    getSetting<boolean>('shop.online_discount_banner_enabled'),
    getSetting<string>('shop.online_discount_banner_text'),
  ]);

  const safe = safePercent(percent);
  return {
    // A promotion of 0% is not a promotion: treat it as off rather than
    // writing `online` as the reason for a discount of nothing.
    enabled: enabled === true && safe > 0,
    percent: safe,
    bannerEnabled: bannerEnabled === true,
    bannerText: typeof bannerText === 'string' ? bannerText : '',
  };
}

// ─── Best-discount resolution ────────────────────────────────────────────────

export interface DiscountCandidate {
  reason: string;
  /** Percentage points, 0–90. */
  percent: number;
}

/**
 * The largest candidate, or null when every one of them is worthless.
 *
 * Ties keep the **first** candidate, and callers pass them in order of who
 * should be credited: the member discount before the online promotion. When
 * both are 10% the order says `member_10`, because that is the one the
 * customer would lose by cancelling their membership.
 */
export function pickBestDiscount(candidates: DiscountCandidate[]): DiscountCandidate | null {
  let best: DiscountCandidate | null = null;
  for (const c of candidates) {
    if (c.percent <= 0) continue;
    if (!best || c.percent > best.percent) best = c;
  }
  return best;
}

/**
 * The discount candidates for a retail order, in credit order.
 *
 * Wholesale is deliberately absent: that channel replaces the whole set with
 * its own 25% and never sees a coupon or the online promotion.
 */
export function retailDiscountCandidates(opts: {
  isMember: boolean;
  promo: ShopPromo;
  couponPercent?: number | null;
  couponCode?: string | null;
}): DiscountCandidate[] {
  const candidates: DiscountCandidate[] = [];
  if (opts.isMember) {
    candidates.push({
      reason: MEMBER_DISCOUNT_REASON,
      percent: MEMBER_SHOP_DISCOUNT * 100,
    });
  }
  if (opts.promo.enabled) {
    candidates.push({ reason: ONLINE_DISCOUNT_REASON, percent: opts.promo.percent });
  }
  if (opts.couponCode && opts.couponPercent && opts.couponPercent > 0) {
    candidates.push({
      reason: couponReason(opts.couponCode),
      percent: opts.couponPercent,
    });
  }
  return candidates;
}

// ─── Coupons ─────────────────────────────────────────────────────────────────

export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  percent: number;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  maxUses: number | null;
  usedCount: number;
  maxUsesPerCustomer: number | null;
  minSubtotal: number | null;
  createdAt: string;
  updatedAt: string;
}

function mapCoupon(row: pg.QueryResultRow): Coupon {
  return {
    id: row.id,
    code: row.code,
    description: row.description,
    percent: parseFloat(row.percent),
    active: row.active,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    maxUses: row.max_uses != null ? Number(row.max_uses) : null,
    usedCount: Number(row.used_count ?? 0),
    maxUsesPerCustomer: row.max_uses_per_customer != null ? Number(row.max_uses_per_customer) : null,
    minSubtotal: row.min_subtotal != null ? parseFloat(row.min_subtotal) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

export async function listCoupons(): Promise<Coupon[]> {
  const result = await query(
    `SELECT * FROM coupons ORDER BY active DESC, created_at DESC`
  );
  return result.rows.map(mapCoupon);
}

export interface CouponInput {
  code: string;
  description?: string | null;
  percent: number;
  active?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  maxUses?: number | null;
  maxUsesPerCustomer?: number | null;
  minSubtotal?: number | null;
}

export async function createCoupon(data: CouponInput): Promise<Coupon> {
  const code = normalizeCouponCode(data.code);
  const existing = await query(`SELECT 1 FROM coupons WHERE upper(code) = $1 LIMIT 1`, [code]);
  if (existing.rows.length > 0) {
    throw new AppError(409, `Já existe um cupom com o código "${code}".`, 'COUPON_CODE_TAKEN');
  }
  const result = await query(
    `INSERT INTO coupons (code, description, percent, active, starts_at, ends_at,
                          max_uses, max_uses_per_customer, min_subtotal)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      code,
      data.description ?? null,
      data.percent,
      data.active ?? true,
      data.startsAt ?? null,
      data.endsAt ?? null,
      data.maxUses ?? null,
      data.maxUsesPerCustomer ?? null,
      data.minSubtotal ?? null,
    ]
  );
  return mapCoupon(result.rows[0]);
}

export async function updateCoupon(id: string, data: Partial<CouponInput>): Promise<Coupon> {
  const fieldMap: Record<string, string> = {
    description: 'description',
    percent: 'percent',
    active: 'active',
    startsAt: 'starts_at',
    endsAt: 'ends_at',
    maxUses: 'max_uses',
    maxUsesPerCustomer: 'max_uses_per_customer',
    minSubtotal: 'min_subtotal',
  };
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  // `code` is not updatable. Orders already written point at it through
  // `discount_reason`, and renaming would silently orphan that history.
  for (const [key, column] of Object.entries(fieldMap)) {
    if (key in data) {
      sets.push(`${column} = $${i++}`);
      params.push((data as Record<string, unknown>)[key] ?? null);
    }
  }
  if (sets.length === 0) {
    const current = await query(`SELECT * FROM coupons WHERE id = $1`, [id]);
    if (current.rows.length === 0) throw new AppError(404, 'Cupom não encontrado.', 'COUPON_NOT_FOUND');
    return mapCoupon(current.rows[0]);
  }
  sets.push(`updated_at = NOW()`);
  params.push(id);
  const result = await query(
    `UPDATE coupons SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    params
  );
  if (result.rows.length === 0) throw new AppError(404, 'Cupom não encontrado.', 'COUPON_NOT_FOUND');
  return mapCoupon(result.rows[0]);
}

/**
 * Switches a coupon off. Never deletes: the redemptions point at it and an
 * order must keep being able to say what paid for its discount.
 */
export async function deactivateCoupon(id: string): Promise<void> {
  const result = await query(
    `UPDATE coupons SET active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id`,
    [id]
  );
  if (result.rows.length === 0) throw new AppError(404, 'Cupom não encontrado.', 'COUPON_NOT_FOUND');
}

// ─── Validation ──────────────────────────────────────────────────────────────

export type CouponRejection =
  | 'COUPON_NOT_FOUND'
  | 'COUPON_INACTIVE'
  | 'COUPON_NOT_STARTED'
  | 'COUPON_EXPIRED'
  | 'COUPON_EXHAUSTED'
  | 'COUPON_ALREADY_USED'
  | 'COUPON_MIN_SUBTOTAL';

export type CouponCheck =
  | { ok: true; coupon: Coupon }
  | { ok: false; code: CouponRejection; message: string };

export interface CouponCheckContext {
  subtotal: number;
  customerEmail?: string | null;
  userId?: string | null;
}

/**
 * Everything that can be judged before the order exists.
 *
 * `max_uses` is checked here so the checkout can say "esgotado" while the
 * customer is still looking at the field, but the check is **advisory**: the
 * binding one is `claimCoupon`, inside the order transaction. Two people
 * spending the last use at the same moment both pass here, and exactly one
 * passes there.
 */
export async function checkCoupon(
  rawCode: string,
  ctx: CouponCheckContext
): Promise<CouponCheck> {
  const code = normalizeCouponCode(rawCode);
  if (!code) {
    return { ok: false, code: 'COUPON_NOT_FOUND', message: 'Informe um cupom.' };
  }

  const result = await query(`SELECT * FROM coupons WHERE upper(code) = $1 LIMIT 1`, [code]);
  if (result.rows.length === 0) {
    return { ok: false, code: 'COUPON_NOT_FOUND', message: 'Cupom não encontrado.' };
  }
  const coupon = mapCoupon(result.rows[0]);

  if (!coupon.active) {
    return { ok: false, code: 'COUPON_INACTIVE', message: 'Este cupom não está mais válido.' };
  }

  const now = Date.now();
  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now) {
    return { ok: false, code: 'COUPON_NOT_STARTED', message: 'Este cupom ainda não começou a valer.' };
  }
  if (coupon.endsAt && new Date(coupon.endsAt).getTime() <= now) {
    return { ok: false, code: 'COUPON_EXPIRED', message: 'Este cupom expirou.' };
  }
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
    return { ok: false, code: 'COUPON_EXHAUSTED', message: 'Este cupom já atingiu o limite de usos.' };
  }
  if (coupon.minSubtotal != null && ctx.subtotal < coupon.minSubtotal) {
    return {
      ok: false,
      code: 'COUPON_MIN_SUBTOTAL',
      message: `Este cupom vale a partir de R$ ${coupon.minSubtotal.toFixed(2).replace('.', ',')} em produtos.`,
    };
  }

  if (coupon.maxUsesPerCustomer != null) {
    const used = await countCustomerRedemptions(coupon.id, ctx);
    if (used >= coupon.maxUsesPerCustomer) {
      return {
        ok: false,
        code: 'COUPON_ALREADY_USED',
        message:
          coupon.maxUsesPerCustomer === 1
            ? 'Você já usou este cupom.'
            : `Você já usou este cupom ${coupon.maxUsesPerCustomer} vez(es).`,
      };
    }
  }

  return { ok: true, coupon };
}

/**
 * How many times this customer already redeemed this coupon.
 *
 * Identity is the logged-in user when there is one, and the e-mail otherwise —
 * the shop takes guest orders, so refusing to count them would make a
 * per-customer limit trivially bypassable by not logging in.
 */
async function countCustomerRedemptions(
  couponId: string,
  ctx: CouponCheckContext
): Promise<number> {
  const conditions: string[] = [];
  const params: unknown[] = [couponId];
  let i = 2;

  if (ctx.userId) {
    conditions.push(`user_id = $${i++}`);
    params.push(ctx.userId);
  }
  const email = ctx.customerEmail?.trim().toLowerCase();
  if (email) {
    conditions.push(`lower(customer_email) = $${i++}`);
    params.push(email);
  }
  if (conditions.length === 0) return 0;

  const result = await query(
    `SELECT COUNT(*)::int AS n FROM coupon_redemptions
      WHERE coupon_id = $1 AND (${conditions.join(' OR ')})`,
    params
  );
  return Number(result.rows[0]?.n ?? 0);
}

// ─── Redemption, inside the order transaction ────────────────────────────────

/**
 * Takes one use of the coupon, or reports that there was none left.
 *
 * The guard lives in the WHERE clause so the read and the write are one
 * statement: `SELECT used_count` followed by `UPDATE` would let two concurrent
 * checkouts both see the last use and both take it.
 */
export async function claimCoupon(
  client: pg.PoolClient,
  couponId: string
): Promise<boolean> {
  const result = await client.query(
    `UPDATE coupons
        SET used_count = used_count + 1, updated_at = NOW()
      WHERE id = $1
        AND active = TRUE
        AND (max_uses IS NULL OR used_count < max_uses)
      RETURNING id`,
    [couponId]
  );
  return result.rows.length > 0;
}

export async function recordRedemption(
  client: pg.PoolClient,
  input: {
    couponId: string;
    orderId: string;
    userId?: string | null;
    customerEmail?: string | null;
    discountAmount: number;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO coupon_redemptions (coupon_id, order_id, user_id, customer_email, discount_amount)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (order_id) DO NOTHING`,
    [
      input.couponId,
      input.orderId,
      input.userId ?? null,
      input.customerEmail?.trim().toLowerCase() ?? null,
      input.discountAmount,
    ]
  );
}

/** Gives a use back when the order it belonged to never became a sale. */
export async function releaseCoupon(couponId: string): Promise<void> {
  await query(
    `UPDATE coupons
        SET used_count = GREATEST(0, used_count - 1), updated_at = NOW()
      WHERE id = $1`,
    [couponId]
  );
}
