import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { createErrorLog } from '../services/log.service.js';

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
