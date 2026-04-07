import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import * as logService from '../services/log.service.js';

export const logRouter = Router();
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
