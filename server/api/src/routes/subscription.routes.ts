import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { paymentLimiter } from '../middleware/rate-limit.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';
import * as subscriptionService from '../services/subscription.service.js';
import { query } from '../config/database.js';

export const subscriptionRouter = Router();
subscriptionRouter.use(authenticate);

const createSchema = z.object({
  member_id: z.string().uuid(),
  plan: z.enum(['silver', 'gold', 'black']),
  frequency_type: z.enum(['months', 'years']),
  payer_email: z.string().email(),
  payer_name: z.string().min(1),
  encrypted_card: z.string().min(1),
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
    res.status(404).json({ error: 'Assinatura não encontrada' });
    return null;
  }
  if (req.user!.role !== 'admin' && req.user!.role !== 'seller') {
    const memberCheck = await query('SELECT user_id FROM members WHERE id = $1', [sub.memberId]);
    if (memberCheck.rows.length === 0 || memberCheck.rows[0].user_id !== req.user!.userId) {
      res.status(403).json({ error: 'Acesso negado' });
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

// PUT /subscription/:id/update-card
subscriptionRouter.put('/:id/update-card', async (req, res, next) => {
  try {
    const sub = await verifySubscriptionOwnership(req, res, req.params.id);
    if (!sub) return;
    const { encrypted_card, payer_name, payer_email } = req.body;
    const result = await subscriptionService.updateCard(req.params.id, encrypted_card, payer_name, payer_email);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
