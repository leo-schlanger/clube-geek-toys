import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { verifyMemberOwnership } from '../middleware/ownership.js';
import { paymentLimiter } from '../middleware/rate-limit.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';
import * as subscriptionService from '../services/subscription.service.js';
import { query } from '../config/database.js';

export const subscriptionRouter = Router();
subscriptionRouter.use(authenticate);

// Pagar.me flow: the browser tokenizes the card against Pagar.me with the
// public key and posts only `card_token`. Raw card data never reaches us.
const createSchema = z.object({
  member_id: z.string().uuid(),
  plan: z.enum(['club']).default('club'),
  /** Accepted for backwards compat — server always bills monthly. */
  frequency_type: z.enum(['months', 'years']).default('months'),
  payer_email: z.string().email(),
  payer_name: z.string().min(1),
  /** Optional for backwards compat — server always uses CLUB_PLAN_PRICE. */
  transaction_amount: z.number().positive().optional(),
  card_token: z.string().min(1).max(200),
});

// POST /subscription/create
subscriptionRouter.post('/create', paymentLimiter, validate(createSchema), async (req, res, next) => {
  try {
    if (!await verifyMemberOwnership(req, res, req.body.member_id)) return;
    const result = await subscriptionService.createSubscription(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// Helper: verify the authenticated user owns the subscription or is admin/seller
async function verifySubscriptionOwnership(req: import('express').Request, res: import('express').Response, subscriptionId: string) {
  const sub = await subscriptionService.getSubscription(subscriptionId);
  if (!sub) {
    res.status(404).json({ error: 'Assinatura não encontrada', code: 'SUBSCRIPTION_NOT_FOUND' });
    return null;
  }
  if (req.user!.role !== 'admin' && req.user!.role !== 'seller') {
    const memberCheck = await query('SELECT user_id FROM members WHERE id = $1', [sub.memberId]);
    if (memberCheck.rows.length === 0 || memberCheck.rows[0].user_id !== req.user!.userId) {
      res.status(403).json({ error: 'Acesso negado', code: 'FORBIDDEN' });
      return null;
    }
  }
  return sub;
}

// GET /subscription/:id
subscriptionRouter.get('/:id', async (req, res, next) => {
  try {
    const sub = await verifySubscriptionOwnership(req, res, req.params.id);
    if (!sub) return;
    res.json(sub);
  } catch (err) {
    next(err);
  }
});

// PUT /subscription/:id/pause
subscriptionRouter.put('/:id/pause', async (req, res, next) => {
  try {
    const sub = await verifySubscriptionOwnership(req, res, req.params.id);
    if (!sub) return;
    const result = await subscriptionService.pauseSubscription(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// PUT /subscription/:id/resume
subscriptionRouter.put('/:id/resume', async (req, res, next) => {
  try {
    const sub = await verifySubscriptionOwnership(req, res, req.params.id);
    if (!sub) return;
    const result = await subscriptionService.resumeSubscription(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// PUT /subscription/:id/cancel
subscriptionRouter.put('/:id/cancel', async (req, res, next) => {
  try {
    const sub = await verifySubscriptionOwnership(req, res, req.params.id);
    if (!sub) return;
    const result = await subscriptionService.cancelSubscription(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /subscription/:id/payments — list payments for a subscription
subscriptionRouter.get('/:id/payments', async (req, res, next) => {
  try {
    const sub = await verifySubscriptionOwnership(req, res, req.params.id);
    if (!sub) return;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const payments = await subscriptionService.getSubscriptionPayments(req.params.id, limit);
    res.json(payments);
  } catch (err) {
    next(err);
  }
});

// PUT /subscription/:id/update-payment-method
// Pagar.me: a `card_token` from the browser. Legacy Stripe subscriptions still
// accept a PaymentMethod id under the old field name, so a member who has not
// migrated can still fix their card.
const updatePMSchema = z
  .object({
    cardToken: z.string().min(1).max(200).optional(),
    paymentMethodId: z.string().min(1).optional(),
  })
  .refine((b) => Boolean(b.cardToken || b.paymentMethodId), {
    message: 'Informe o cartão.',
    path: ['cardToken'],
  });
subscriptionRouter.put('/:id/update-payment-method', paymentLimiter, validate(updatePMSchema), async (req, res, next) => {
  try {
    const sub = await verifySubscriptionOwnership(req, res, req.params.id as string);
    if (!sub) return;
    const body = req.body as { cardToken?: string; paymentMethodId?: string };
    const result = await subscriptionService.updatePaymentMethod(
      req.params.id as string,
      (body.cardToken ?? body.paymentMethodId) as string,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});
