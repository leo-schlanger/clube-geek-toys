import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import * as webhookService from '../services/webhook.service.js';
import { pagbankRequest, verifyWebhookSignature, getPagBankPublicKey } from '../utils/pagbank.js';
import type { PagBankOrder } from '../utils/pagbank.js';
import { env } from '../config/env.js';

export const webhookRouter = Router();

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many webhook requests', code: 'RATE_LIMITED' },
});

// POST /webhook/pagbank — PagBank sends full order data in JSON body
webhookRouter.post('/pagbank', webhookLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawBody = req.body as Buffer;
    const requestId = (req.headers['x-request-id'] as string) || '';

    // 1. RSA signature verification (PagBank uses asymmetric signing, not HMAC).
    // Reference: https://developer.pagbank.com.br/reference/webhooks
    //
    // - The signature is base64-encoded in the `x-payload-signature` header.
    // - We fetch PagBank's public key from /public-keys (cached 24h) and verify with RSA-SHA256.
    // - Sandbox does NOT send the header, so we skip verification in non-production.
    // - Production: if the public key fetch fails, fall back to server-to-server GET below as
    //   the only security gate, with a loud warning. Avoids fail-closed deploy.
    if (env.NODE_ENV === 'production') {
      const signature = req.headers['x-payload-signature'] as string | undefined;
      if (!signature) {
        console.warn(`[WEBHOOK] Missing x-payload-signature header in production (requestId=${requestId})`);
        res.status(401).json({ error: 'Assinatura do webhook ausente', code: 'WEBHOOK_MISSING_SIGNATURE' });
        return;
      }
      const publicKey = await getPagBankPublicKey();
      if (!publicKey) {
        console.error('[WEBHOOK] ⚠ Could not fetch PagBank public key. Falling back to server-to-server verification ONLY — degraded security state.');
        // Fall through to server-to-server verification below.
      } else {
        const valid = verifyWebhookSignature(rawBody, signature, publicKey);
        if (!valid) {
          console.warn(`[WEBHOOK] Rejected webhook with invalid signature (requestId=${requestId})`);
          res.status(401).json({ error: 'Assinatura do webhook inválida', code: 'WEBHOOK_INVALID_SIGNATURE' });
          return;
        }
      }
    }

    let body: PagBankOrder;
    try {
      body = JSON.parse(rawBody.toString()) as PagBankOrder;
    } catch {
      res.status(400).json({ error: 'Webhook payload inválido', code: 'WEBHOOK_INVALID_PAYLOAD' });
      return;
    }

    // 2. Server-to-server verification — defense in depth: confirm order with PagBank API
    const orderId = body.id;
    if (!orderId) {
      res.status(400).json({ error: 'Webhook sem order ID', code: 'WEBHOOK_MISSING_ORDER_ID' });
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
      // Return 200 anyway so PagBank doesn't retry forever; log for manual investigation.
      res.status(200).json({ status: 'verification_failed', orderId });
      return;
    }

    await webhookService.processWebhook({
      body: verifiedBody,
      requestId,
    });

    res.status(200).json({ status: 'ok' });
  } catch (err) {
    // Log but always 200 to avoid PagBank retry storms — idempotency in service handles dupes.
    console.error('[WEBHOOK] Processing error:', err);
    res.status(200).json({ status: 'processing_error' });
    next(err);
  }
});
