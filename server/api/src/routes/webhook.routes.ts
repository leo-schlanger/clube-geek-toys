import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import Stripe from 'stripe';
import { verifyWebhookEvent } from '../utils/stripe.js';
import { processStripeEvent } from '../services/webhook.service.js';
import {
  processPagarmeEvent,
  verifyWebhookAuth,
  webhookAuthConfigured,
  type PagarmeWebhookEvent,
} from '../services/pagarme-webhook.service.js';
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
    } else if (env.NODE_ENV === 'production') {
      // Production MUST have webhook secret — reject all events without it
      console.error('[WEBHOOK] STRIPE_WEBHOOK_SECRET not set in production — rejecting event');
      res.status(500).json({ error: 'Webhook secret not configured', code: 'WEBHOOK_MISCONFIGURED' });
      return;
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
    // 500 so Stripe re-delivers. The old comment had it backwards: the claim in
    // `processed_webhooks` is INSERTed inside the same transaction as the
    // effects, so a failure rolls it back and the event is NOT recorded as
    // processed. Idempotency is what makes a retry *safe*, not what makes one
    // unnecessary — answering 200 just told Stripe to forget a payment that was
    // captured but never applied, leaving the order `pending` forever.
    console.error('[WEBHOOK] Processing error:', err);
    res.status(500).json({ status: 'processing_error' });
  }
});

/**
 * POST /webhook/pagarme — the event stream that settles PIX and card charges.
 *
 * Pagar.me v5 has no HMAC signature: the endpoint is protected by the Basic
 * credentials configured alongside the webhook in their dashboard. A shared
 * secret in a header proves the caller knows the secret, not that the body is
 * genuine — so the processor re-reads every money-moving charge from the API
 * before acting on it. The two together are what make a forged `charge.paid`
 * worth nothing.
 */
/**
 * GET /webhook/pagarme — a liveness answer, nothing more.
 *
 * The endpoint only accepts POST, so opening the URL in a browser used to give
 * Express's "Cannot GET" 404. That reads as a broken endpoint to whoever is
 * pasting the URL into the Pagar.me dashboard, and it would also fail a panel
 * that pings the URL before letting you save it.
 *
 * It processes nothing and reveals nothing: whether the credentials are set is
 * already public in `GET /health`.
 */
webhookRouter.get('/pagarme', webhookLimiter, (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    endpoint: 'pagarme',
    accepts: 'POST',
    authenticated: webhookAuthConfigured(),
    message: 'Endpoint ativo. As notificações da Pagar.me chegam por POST com Basic auth.',
  });
});

webhookRouter.post('/pagarme', webhookLimiter, async (req: Request, res: Response) => {
  try {
    if (!verifyWebhookAuth(req.headers.authorization)) {
      console.warn('[PAGARME-HOOK] rejected: bad or missing Basic credentials');
      // 401 without a WWW-Authenticate challenge: this endpoint is for one
      // configured caller, not for a browser to negotiate with.
      res.status(401).json({ error: 'Unauthorized', code: 'WEBHOOK_UNAUTHORIZED' });
      return;
    }

    // The router is mounted behind `express.raw`, so the body is a Buffer.
    let event: PagarmeWebhookEvent;
    try {
      event = JSON.parse((req.body as Buffer).toString('utf8')) as PagarmeWebhookEvent;
    } catch {
      res.status(400).json({ error: 'Invalid webhook payload', code: 'WEBHOOK_INVALID_PAYLOAD' });
      return;
    }

    if (!event?.id || !event?.type) {
      res.status(400).json({ error: 'Malformed webhook event', code: 'WEBHOOK_MALFORMED' });
      return;
    }

    console.log(`[PAGARME-HOOK] Processing ${event.type} (${event.id})`);
    await processPagarmeEvent(event);

    res.status(200).json({ status: 'ok' });
  } catch (err) {
    // 500 so Pagar.me re-delivers. The claim in `processed_webhooks` is written
    // inside the same transaction as the effects, so a failure rolls it back
    // and the event is NOT recorded as processed — idempotency is what makes
    // the retry *safe*, not what makes it unnecessary. Answering 200 here would
    // tell Pagar.me to forget a payment that was captured but never applied.
    console.error('[PAGARME-HOOK] Processing error:', err);
    res.status(500).json({ status: 'processing_error' });
  }
});

// POST /webhook/pagbank — transitional: return 410 Gone
webhookRouter.post('/pagbank', (_req: Request, res: Response) => {
  res.status(410).json({
    error: 'PagBank webhooks are no longer accepted. Payments run on Pagar.me.',
    code: 'PAGBANK_DEPRECATED',
  });
});
