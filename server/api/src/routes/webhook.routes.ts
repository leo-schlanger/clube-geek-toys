import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import * as webhookService from '../services/webhook.service.js';
import { pagbankRequest } from '../utils/pagbank.js';
import type { PagBankOrder } from '../utils/pagbank.js';

export const webhookRouter = Router();

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many webhook requests' },
});

// POST /webhook/pagbank — PagBank sends full order data in JSON body
webhookRouter.post('/pagbank', webhookLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawBody = req.body as Buffer;
    const requestId = req.headers['x-request-id'] as string || '';

    const body = JSON.parse(rawBody.toString()) as PagBankOrder;

    // Server-to-server verification: confirm the order status with PagBank API
    const orderId = body.id;
    if (!orderId) {
      res.status(400).json({ error: 'Invalid webhook: missing order ID' });
      return;
    }

    let verifiedBody: PagBankOrder;
    try {
      verifiedBody = await pagbankRequest<PagBankOrder>({
        method: 'GET',
        path: `/orders/${orderId}`,
      });
    } catch (err) {
      console.error(`[WEBHOOK] Failed to verify order ${orderId} with PagBank:`, err);
      res.status(422).json({ error: 'Could not verify order with PagBank' });
      return;
    }

    await webhookService.processWebhook({
      body: verifiedBody,
      requestId,
    });

    res.status(200).json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});
