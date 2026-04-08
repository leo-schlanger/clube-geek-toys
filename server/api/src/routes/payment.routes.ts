import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { verifyMemberOwnership, getMemberIdForUser } from '../middleware/ownership.js';
import { paymentLimiter } from '../middleware/rate-limit.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';
import * as paymentService from '../services/payment.service.js';

export const paymentRouter = Router();

const pixCreateSchema = z.object({
  amount: z.number().positive(),
  description: z.string().min(1),
  payer_email: z.string().email(),
  external_reference: z.string().min(1),
});

const cardCreateSchema = z.object({
  amount: z.number().positive(),
  description: z.string().min(1),
  payer_email: z.string().email(),
  payer_name: z.string().min(1),
  encrypted_card: z.string().min(1),
  external_reference: z.string().min(1),
  installments: z.number().int().min(1).max(12).optional(),
});

// POST /pix/create — PIX QR code payment
paymentRouter.post('/create', authenticate, paymentLimiter, validate(pixCreateSchema), async (req, res, next) => {
  try {
    // Verify the user owns the member being paid for
    if (!await verifyMemberOwnership(req, res, req.body.external_reference)) return;
    const result = await paymentService.createPixPayment(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// POST /checkout/create — Credit card direct payment (PagBank encrypted)
paymentRouter.post('/checkout/create', authenticate, paymentLimiter, validate(cardCreateSchema), async (req, res, next) => {
  try {
    // Verify the user owns the member being paid for
    if (!await verifyMemberOwnership(req, res, req.body.external_reference)) return;
    const result = await paymentService.createCardPayment(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// GET /payments — list payments with optional filters
paymentRouter.get('/', authenticate, async (req, res, next) => {
  try {
    let memberId = req.query.member_id as string | undefined;

    // Members can only see their own payments
    if (req.user!.role === 'member') {
      const userMemberId = await getMemberIdForUser(req.user!.userId);
      if (!userMemberId) {
        res.json([]);
        return;
      }
      memberId = userMemberId;
    }

    const filters = {
      memberId,
      status: req.query.status as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    };
    const result = await paymentService.getPayments(filters);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /payment/status/:orderId
paymentRouter.get('/status/:paymentId', authenticate, async (req, res, next) => {
  try {
    const result = await paymentService.getPaymentStatus(req.params.paymentId as string);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
