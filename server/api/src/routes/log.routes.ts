import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { defaultLimiter } from '../middleware/rate-limit.js';
import * as logService from '../services/log.service.js';

export const logRouter = Router();

// Bounded schema to prevent log flood / disk DoS via large payloads.
const errorLogSchema = z.object({
  severity: z.enum(['debug', 'info', 'warning', 'error', 'fatal']).default('error'),
  message: z.string().min(1).max(5000),
  stack: z.string().max(20000).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  url: z.string().max(2000).optional(),
});

// POST /logs/errors — receives frontend errors (auth optional, rate limited, schema validated)
logRouter.post('/errors', defaultLimiter, validate(errorLogSchema), async (req, res, next) => {
  try {
    const { severity, message, stack, context, url } = req.body as z.infer<typeof errorLogSchema>;

    // Extract user ID from token if present (optional auth)
    let userId: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const jwt = await import('jsonwebtoken');
        const { env } = await import('../config/env.js');
        const decoded = jwt.default.verify(authHeader.slice(7), env.JWT_SECRET) as { userId: string };
        userId = decoded.userId;
      } catch {
        // Token invalid/expired — still log the error
      }
    }

    await logService.createErrorLog({
      severity,
      message,
      stack,
      source: 'frontend',
      context,
      userId,
      url,
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });

    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Admin-only routes below
logRouter.use(authenticate, requireRole('admin'));

// GET /logs/audit
logRouter.get('/audit', async (req, res, next) => {
  try {
    const { memberId, limit } = req.query;
    const result = await logService.getAuditLogs({
      memberId: memberId as string,
      limit: Number(limit) || 50,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /logs/email
logRouter.get('/email', async (req, res, next) => {
  try {
    const { memberId, limit } = req.query;
    const result = await logService.getEmailLogs({
      memberId: memberId as string,
      limit: Number(limit) || 50,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /logs/errors
logRouter.get('/errors', async (req, res, next) => {
  try {
    const { severity, source, limit } = req.query;
    const result = await logService.getErrorLogs({
      severity: severity as string,
      source: source as string,
      limit: Number(limit) || 50,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /logs/errors/stats
logRouter.get('/errors/stats', async (req, res, next) => {
  try {
    const result = await logService.getErrorStats();
    res.json(result);
  } catch (err) {
    next(err);
  }
});
