import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { paymentLimiter } from '../middleware/rate-limit.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';
import * as subscriptionService from '../services/subscription.service.js';

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

// GET /subscription/:id
subscriptionRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await subscriptionService.getSubscription(req.params.id);
    if (!result) {
      res.status(404).json({ error: 'Assinatura não encontrada' });
      return;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// PUT /subscription/:id/pause
subscriptionRouter.put('/:id/pause', async (req, res, next) => {
  try {
    const result = await subscriptionService.pauseSubscription(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// PUT /subscription/:id/resume
subscriptionRouter.put('/:id/resume', async (req, res, next) => {
  try {
    const result = await subscriptionService.resumeSubscription(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// PUT /subscription/:id/cancel
subscriptionRouter.put('/:id/cancel', async (req, res, next) => {
  try {
    const result = await subscriptionService.cancelSubscription(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// PUT /subscription/:id/update-card
subscriptionRouter.put('/:id/update-card', async (req, res, next) => {
  try {
    const { encrypted_card, payer_name, payer_email } = req.body;
    const result = await subscriptionService.updateCard(req.params.id, encrypted_card, payer_name, payer_email);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
