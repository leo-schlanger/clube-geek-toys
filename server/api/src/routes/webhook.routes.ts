import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import Stripe from 'stripe';
import { verifyWebhookEvent } from '../utils/stripe.js';
import { processStripeEvent } from '../services/webhook.service.js';
import { env } from '../config/env.js';

export const webhookRouter = Router();

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many webhook requests', code: 'RATE_LIMITED' },
});

// POST /webhook/stripe — Stripe sends events with raw body + signature header
webhookRouter.post('/stripe', webhookLimiter, async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const rawBody = req.body as Buffer;
    const signature = req.headers['stripe-signature'] as string | undefined;

    let event: Stripe.Event;

    const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

    if (webhookSecret) {
      // Production: verify signature using Stripe SDK (HMAC-SHA256)
      if (!signature) {
        console.warn('[WEBHOOK] Missing stripe-signature header');
        res.status(400).json({ error: 'Missing stripe-signature header', code: 'WEBHOOK_MISSING_SIGNATURE' });
        return;
      }

      try {
        event = verifyWebhookEvent(rawBody, signature, webhookSecret);
      } catch (err) {
        console.warn('[WEBHOOK] Invalid Stripe signature:', (err as Error).message);
        res.status(401).json({ error: 'Invalid webhook signature', code: 'WEBHOOK_INVALID_SIGNATURE' });
        return;
      }
    } else {
      // Development: no secret configured, parse raw body directly
      console.warn('[WEBHOOK] STRIPE_WEBHOOK_SECRET not set — skipping signature verification (dev only)');
      try {
        event = JSON.parse(rawBody.toString()) as Stripe.Event;
      } catch {
        res.status(400).json({ error: 'Invalid webhook payload', code: 'WEBHOOK_INVALID_PAYLOAD' });
        return;
      }
    }

    console.log(`[WEBHOOK] Processing Stripe event: ${event.type} (${event.id})`);

    await processStripeEvent(event);

    res.status(200).json({ status: 'ok' });
  } catch (err) {
    // Log but always 200 to avoid Stripe retry storms — idempotency in service handles dupes.
    console.error('[WEBHOOK] Processing error:', err);
    res.status(200).json({ status: 'processing_error' });
  }
});

// POST /webhook/pagbank — transitional: return 410 Gone
webhookRouter.post('/pagbank', (_req: Request, res: Response) => {
  res.status(410).json({
    error: 'PagBank webhooks are no longer accepted. Migration to Stripe complete.',
    code: 'PAGBANK_DEPRECATED',
  });
});
