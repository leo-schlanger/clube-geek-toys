import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { publicLookupLimiter } from '../middleware/rate-limit.js';
import * as promoService from '../services/promo.service.js';

export const promoRouter = Router();

// ─── Public: the promotion the storefront announces ──────────────────────────

/**
 * GET /promo — the online-channel promotion.
 *
 * Public because the shop is public and the banner has to render before anyone
 * logs in. It deliberately exposes only what the announcement needs; the rest
 * of the settings catalogue stays behind the admin-only /settings.
 */
promoRouter.get('/', async (_req, res, next) => {
  try {
    const promo = await promoService.getShopPromo();
    // Short on purpose, and the reason this route is exempt from the public
    // throttle: the banner is requested on every shop page, so a 15/min limiter
    // would break normal browsing long before it bothered a scraper. The
    // admin still sees a change go live within the minute.
    res.set('Cache-Control', 'public, max-age=60');
    res.json(promo);
  } catch (err) {
    next(err);
  }
});

// ─── Public: check a coupon before checkout ──────────────────────────────────

const couponCheckSchema = z.object({
  code: z.string().min(1).max(promoService.MAX_COUPON_CODE_LENGTH),
  subtotal: z.number().nonnegative(),
  email: z.string().email().optional().nullable(),
});

/**
 * POST /promo/coupon-check — "does this code work, and for how much?"
 *
 * A POST that writes nothing: the basket total is needed to judge
 * `min_subtotal`, and a subtotal does not belong in a query string that ends up
 * in access logs. Rate limited because it is an unauthenticated endpoint that
 * answers whether a code exists, which is the shape of a guessing tool.
 *
 * The answer is advisory. The order is priced again from scratch server-side,
 * and the use is only taken there.
 */
promoRouter.post(
  '/coupon-check',
  publicLookupLimiter,
  optionalAuth,
  validate(couponCheckSchema),
  async (req, res, next) => {
    try {
      const { code, subtotal, email } = req.body as z.infer<typeof couponCheckSchema>;
      const check = await promoService.checkCoupon(code, {
        subtotal,
        customerEmail: email ?? null,
        userId: req.user?.userId ?? null,
      });

      if (!check.ok) {
        // 200, not 4xx: "this coupon does not apply" is a normal answer to a
        // normal question, and the checkout renders it as a hint under the
        // field rather than as a failed request.
        res.json({ valid: false, code: check.code, message: check.message });
        return;
      }

      res.json({
        valid: true,
        code: check.coupon.code,
        percent: check.coupon.percent,
        description: check.coupon.description,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Admin: coupon CRUD ──────────────────────────────────────────────────────

const isoDate = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

const couponSchema = z.object({
  code: z
    .string()
    .min(3)
    .max(promoService.MAX_COUPON_CODE_LENGTH)
    // Letters and digits only: the code travels inside `discount_reason`, and a
    // separator there would be indistinguishable from the `+store_credit` join.
    .regex(/^[A-Za-z0-9-]+$/, 'Use apenas letras, números e hífen.'),
  description: z.string().max(200).optional().nullable(),
  percent: z.number().positive().max(90),
  active: z.boolean().optional(),
  startsAt: isoDate.optional().nullable(),
  endsAt: isoDate.optional().nullable(),
  maxUses: z.number().int().positive().optional().nullable(),
  maxUsesPerCustomer: z.number().int().positive().optional().nullable(),
  minSubtotal: z.number().nonnegative().optional().nullable(),
});

promoRouter.get('/coupons', authenticate, requireRole('admin'), async (_req, res, next) => {
  try {
    res.json({ coupons: await promoService.listCoupons() });
  } catch (err) {
    next(err);
  }
});

promoRouter.post(
  '/coupons',
  authenticate,
  requireRole('admin'),
  validate(couponSchema),
  async (req, res, next) => {
    try {
      res.status(201).json(await promoService.createCoupon(req.body));
    } catch (err) {
      next(err);
    }
  }
);

// `code` is intentionally not in the update shape — see updateCoupon.
promoRouter.patch(
  '/coupons/:id',
  authenticate,
  requireRole('admin'),
  validate(couponSchema.omit({ code: true }).partial()),
  async (req, res, next) => {
    try {
      res.json(await promoService.updateCoupon(req.params.id as string, req.body));
    } catch (err) {
      next(err);
    }
  }
);

promoRouter.delete('/coupons/:id', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    await promoService.deactivateCoupon(req.params.id as string);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
