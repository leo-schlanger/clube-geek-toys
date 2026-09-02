import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { verifyMemberOwnership, getMemberIdForUser } from '../middleware/ownership.js';
import { paymentLimiter, publicLookupLimiter } from '../middleware/rate-limit.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';
import * as paymentService from '../services/payment.service.js';
import { env } from '../config/env.js';
import { maxInstallmentsFor, isPagarmeConfigured } from '../utils/pagarme.js';

export const paymentRouter = Router();

// Pagar.me flow: the browser exchanges the card for a `card_token` against
// Pagar.me directly (public key, no secret on the page), and posts only the
// token here. Raw card data never touches this server.

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
  card_token: z.string().min(1),
  installments: z.number().int().min(1).max(12).optional(),
});

/**
 * GET /payment/config — what the checkout needs before it can render.
 *
 * The public key is public by definition (it identifies the store in the
 * tokenization call), so this endpoint is unauthenticated. It exists so the key
 * and the instalment rules come from the server rather than from a build-time
 * variable that goes stale on the next deploy.
 */
paymentRouter.get('/config', publicLookupLimiter, (_req, res) => {
  res.json({
    provider: 'pagarme',
    publicKey: env.PAGARME_PUBLIC_KEY ?? null,
    configured: isPagarmeConfigured() && Boolean(env.PAGARME_PUBLIC_KEY),
    maxInstallments: env.PAGARME_MAX_INSTALLMENTS,
    minInstallmentAmount: env.PAGARME_MIN_INSTALLMENT_AMOUNT,
    pixExpiresIn: env.PAGARME_PIX_EXPIRES_IN,
  });
});

/** GET /payment/installments?amount=199.90 — the splits offered for a total. */
paymentRouter.get('/installments', publicLookupLimiter, (req, res) => {
  const amount = Number(req.query.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: 'Valor inválido.', code: 'INVALID_AMOUNT' });
    return;
  }
  const max = maxInstallmentsFor(amount);
  res.json({
    maxInstallments: max,
    // No interest is charged, so each option is a plain division. Sending the
    // computed value keeps the rounding identical to what will be charged.
    options: Array.from({ length: max }, (_, i) => {
      const n = i + 1;
      return { installments: n, amount: Math.round((amount / n) * 100) / 100, interestFree: true };
    }),
  });
});

// POST /pix/create — PIX QR issued by Pagar.me; the webhook settles it
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

    const result = await paymentService.createPixPayment({
      amount: req.body.amount,
      description: req.body.description,
      payerEmail: req.body.payer_email,
      memberId: req.body.external_reference,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// POST /card/create — authorise a card charge from a Pagar.me card_token.
// NOTE: paymentRouter is mounted on multiple paths (/pix, /checkout, /payment, /payments).
// To avoid route collision, card uses '/card/create' (→ /payment/card/create or /checkout/card/create).
paymentRouter.post('/card/create', authenticate, paymentLimiter, validate(cardCreateSchema), async (req, res, next) => {
  try {
    if (!await verifyMemberOwnership(req, res, req.body.external_reference)) return;

    const recent = await paymentService.findRecentPayment(req.body.external_reference);
    if (recent) {
      res.status(409).json({
        error: 'Você já tem um pagamento recente. Verifique seu histórico antes de gerar outro.',
        code: 'RECENT_PAYMENT_EXISTS',
        details: { recentPaymentId: recent.id, paidAt: recent.paid_at, amount: parseFloat(recent.amount) },
      });
      return;
    }

    const result = await paymentService.createCardPayment({
      amount: req.body.amount,
      description: req.body.description,
      payerEmail: req.body.payer_email,
      payerName: req.body.payer_name,
      memberId: req.body.external_reference,
      cardToken: req.body.card_token,
      installments: req.body.installments,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// POST /payments/:id/confirm — admin manually confirms a PIX payment
paymentRouter.post('/:id/confirm', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const result = await paymentService.confirmPixPayment({
      paymentId: req.params.id as string,
      adminUserId: req.user!.userId,
    });
    res.json(result);
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

/**
 * GET /payment/status/:paymentId — the caller's own payment.
 *
 * It used to take any id from any logged-in account and answer with the amount,
 * method and status of somebody else's payment.
 */
paymentRouter.get('/status/:paymentId', authenticate, async (req, res, next) => {
  try {
    const paymentId = req.params.paymentId as string;
    const isStaff = req.user?.role === 'admin' || req.user?.role === 'seller';
    if (!isStaff && !(await paymentService.userOwnsPayment(req.user!.userId, paymentId))) {
      res.status(404).json({ error: 'Pagamento não encontrado.' });
      return;
    }
    const result = await paymentService.getPaymentStatus(paymentId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
