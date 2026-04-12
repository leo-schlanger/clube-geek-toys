import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { paymentLimiter } from '../middleware/rate-limit.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';
import * as subscriptionService from '../services/subscription.service.js';
import { query } from '../config/database.js';

export const subscriptionRouter = Router();
subscriptionRouter.use(authenticate);

// Stripe flow: frontend receives clientSecret from create, then uses Stripe.js to confirm.
// No `encrypted_card` needed — Stripe Elements handles tokenization client-side.
const createSchema = z.object({
  member_id: z.string().uuid(),
  plan: z.enum(['silver', 'gold', 'black']),
  frequency_type: z.enum(['months', 'years']),
  payer_email: z.string().email(),
  payer_name: z.string().min(1),
  transaction_amount: z.number().positive(),
});

// POST /subscription/create
subscriptionRouter.post('/create', paymentLimiter, validate(createSchema), async (req, res, next) => {
  try {
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
// Stripe flow: frontend creates a PaymentMethod via Stripe.js, sends its ID here.
const updatePMSchema = z.object({
  paymentMethodId: z.string().min(1),
});
subscriptionRouter.put('/:id/update-payment-method', validate(updatePMSchema), async (req, res, next) => {
  try {
    const sub = await verifySubscriptionOwnership(req, res, req.params.id as string);
    if (!sub) return;
    const body = req.body as { paymentMethodId: string };
    const result = await subscriptionService.updatePaymentMethod(req.params.id as string, body.paymentMethodId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
