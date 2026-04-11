import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { createErrorLog } from '../services/log.service.js';
import { PagBankError } from '../utils/pagbank.js';

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

/**
 * Map PagBank upstream error codes to user-friendly PT-BR messages.
 * The goal is to NEVER show the client a raw PagBank English message or a bare 500.
 */
function mapPagBankErrorToBody(err: PagBankError): { status: number; body: ErrorBody } {
  // Operator/infra issues → user sees a generic "gateway indisponível" message,
  // we log the raw PagBank reason for internal debugging via createErrorLog.
  if (err.code === 'PAGBANK_ERROR') {
    // Known operational states that aren't the user's fault — show a neutral message,
    // not the raw PagBank error string (which may mention internal config to the client).
    if (/whitelist|access[_ ]denied/i.test(err.message)) {
      return {
        status: 503,
        body: {
          error: 'Pagamento temporariamente indisponível. Nossa equipe já foi notificada.',
          code: 'PAYMENT_GATEWAY_UNAVAILABLE',
        },
      };
    }
    return {
      status: 502,
      body: {
        error: 'Não foi possível se comunicar com a operadora de pagamento. Tente novamente em alguns instantes.',
        code: 'PAGBANK_UPSTREAM_ERROR',
      },
    };
  }
  // Code already mapped in utils/pagbank.ts (card declined, CVV wrong, etc) — pass through.
  return {
    status: 402,
    body: { error: err.message, code: err.code },
  };
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

  if (err instanceof PagBankError) {
    const { status, body } = mapPagBankErrorToBody(err);
    // Still persist the raw upstream error for internal troubleshooting.
    createErrorLog({
      severity: 'error',
      message: `PagBank: ${err.message}`,
      source: 'backend',
      context: { path: req.path, method: req.method, code: err.code, httpStatus: err.httpStatus },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    }).catch(() => { /* noop */ });
    res.status(status).json(body);
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
