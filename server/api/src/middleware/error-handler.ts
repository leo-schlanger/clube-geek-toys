import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

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
  _req: Request,
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

  res.status(500).json({
    error: 'Erro interno do servidor',
    ...(env.NODE_ENV === 'development' && { detail: err.message }),
  });
}
