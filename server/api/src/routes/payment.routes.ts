import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { verifyMemberOwnership, getMemberIdForUser } from '../middleware/ownership.js';
import { paymentLimiter } from '../middleware/rate-limit.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';
import * as paymentService from '../services/payment.service.js';

export const paymentRouter = Router();

// Stripe flow: frontend receives clientSecret from these endpoints,
// then uses Stripe.js to complete payment (no encrypted_card on our server).

const pixCreateSchema = z.object({
  amount: z.number().positive(),
  description: z.string().min(1),
  payer_email: z.string().email(),
  external_reference: z.string().min(1), // memberId
});

const cardCreateSchema = z.object({
  amount: z.number().positive(),
  description: z.string().min(1),
  payer_email: z.string().email(),
  payer_name: z.string().min(1),
  external_reference: z.string().min(1), // memberId
});

// POST /pix/create — create Stripe PaymentIntent for PIX
paymentRouter.post('/create', authenticate, paymentLimiter, validate(pixCreateSchema), async (req, res, next) => {
  try {
    if (!await verifyMemberOwnership(req, res, req.body.external_reference)) return;

    // Duplicate-payment guard
    const recent = await paymentService.findRecentPayment(req.body.external_reference);
    if (recent) {
      res.status(409).json({
        error: 'Você já tem um pagamento recente. Verifique seu histórico antes de gerar outro.',
        code: 'RECENT_PAYMENT_EXISTS',
        details: { recentPaymentId: recent.id, paidAt: recent.paid_at, amount: parseFloat(recent.amount) },
      });
      return;
    }

    const result = await paymentService.createPixPayment(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// POST /checkout/create — create Stripe PaymentIntent for card
// No encrypted_card needed — Stripe Elements handles tokenization client-side.
paymentRouter.post('/checkout/create', authenticate, paymentLimiter, validate(cardCreateSchema), async (req, res, next) => {
  try {
    if (!await verifyMemberOwnership(req, res, req.body.external_reference)) return;

    // Duplicate-payment guard
    const recent = await paymentService.findRecentPayment(req.body.external_reference);
    if (recent) {
      res.status(409).json({
        error: 'Você já tem um pagamento recente. Verifique seu histórico antes de gerar outro.',
        code: 'RECENT_PAYMENT_EXISTS',
        details: { recentPaymentId: recent.id, paidAt: recent.paid_at, amount: parseFloat(recent.amount) },
      });
      return;
    }

    const result = await paymentService.createCardPayment(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// POST /payments/:id/refund — admin-only refund
const refundSchema = z.object({
  reason: z.string().max(500).optional(),
});
paymentRouter.post('/:id/refund', authenticate, requireRole('admin'), validate(refundSchema), async (req, res, next) => {
  try {
    const result = await paymentService.refundPayment({
      paymentId: req.params.id as string,
      adminUserId: req.user!.userId,
      reason: req.body.reason,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /payments — list payments with optional filters
paymentRouter.get('/', authenticate, async (req, res, next) => {
  try {
    let memberId = req.query.member_id as string | undefined;

    if (req.user!.role === 'member') {
      const userMemberId = await getMemberIdForUser(req.user!.userId);
      if (!userMemberId) {
        res.json([]);
        return;
      }
      memberId = userMemberId;
    }

    const result = await paymentService.getPayments({
      memberId,
      status: req.query.status as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /payment/status/:paymentIntentId — query Stripe for current status
paymentRouter.get('/status/:paymentId', authenticate, async (req, res, next) => {
  try {
    const result = await paymentService.getPaymentStatus(req.params.paymentId as string);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
