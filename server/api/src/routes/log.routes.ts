import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import * as logService from '../services/log.service.js';

export const logRouter = Router();

// POST /logs/errors — receives frontend errors (auth optional, rate limited)
logRouter.post('/errors', async (req, res, next) => {
  try {
    const { severity, message, stack, context, url } = req.body;
    if (!message) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    // Extract user ID from token if present
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
      severity: severity || 'error',
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
