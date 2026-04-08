import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { createErrorLog } from '../services/log.service.js';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error(`[ERROR] ${err.name}: ${err.message}`);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  if (err.message?.includes('CORS')) {
    res.status(403).json({ error: err.message });
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

  res.status(500).json({
    error: 'Erro interno do servidor',
    ...(env.NODE_ENV === 'development' && { detail: err.message }),
  });
}
