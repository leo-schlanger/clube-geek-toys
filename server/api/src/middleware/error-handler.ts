import { Request, Response, NextFunction } from 'express';
import Stripe from 'stripe';
import { env } from '../config/env.js';
import { createErrorLog } from '../services/log.service.js';
import { mapStripeDeclineMessage } from '../utils/stripe.js';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

interface ErrorBody {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error(`[ERROR] ${err.name}: ${err.message}`);

  if (err instanceof AppError) {
    const body: ErrorBody = { error: err.message };
    if (err.code) body.code = err.code;
    if (err.details) body.details = err.details;
    res.status(err.statusCode).json(body);
    return;
  }

  // Stripe API errors — map to user-friendly PT-BR
  if (err instanceof Stripe.errors.StripeError) {
    createErrorLog({
      severity: 'error',
      message: `Stripe: ${err.message}`,
      source: 'backend',
      context: { path: req.path, method: req.method, type: err.type, code: err.code, decline_code: (err as { decline_code?: string }).decline_code },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    }).catch(() => { /* noop */ });

    if (err.type === 'StripeCardError') {
      const declineCode = (err as { decline_code?: string }).decline_code;
      res.status(402).json({
        error: mapStripeDeclineMessage(declineCode),
        code: `CARD_${(declineCode || 'DECLINED').toUpperCase()}`,
      });
      return;
    }

    if (err.type === 'StripeAuthenticationError') {
      res.status(503).json({
        error: 'Pagamento temporariamente indisponível. Nossa equipe já foi notificada.',
        code: 'PAYMENT_GATEWAY_AUTH_ERROR',
      });
      return;
    }

    // Other Stripe errors (rate limit, API, connection, etc.)
    res.status(502).json({
      error: 'Não foi possível se comunicar com a operadora de pagamento. Tente novamente em alguns instantes.',
      code: 'STRIPE_UPSTREAM_ERROR',
    });
    return;
  }

  if (err.message?.includes('CORS')) {
    res.status(403).json({ error: err.message, code: 'CORS_BLOCKED' });
    return;
  }

  // Persist unexpected errors to error_logs
  createErrorLog({
    severity: 'error',
    message: err.message || 'Unknown error',
    stack: err.stack,
    source: 'backend',
    context: { path: req.path, method: req.method },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  }).catch(() => { /* silently fail — can't log errors about logging */ });

  const body: ErrorBody = {
    error: 'Erro interno do servidor',
    code: 'INTERNAL_ERROR',
  };
  if (env.NODE_ENV === 'development') {
    body.details = { detail: err.message };
  }
  res.status(500).json(body);
}
