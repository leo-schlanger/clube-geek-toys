import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import * as reportService from '../services/report.service.js';

export const reportRouter = Router();
reportRouter.use(authenticate, requireRole('admin'));

// GET /reports/daily
reportRouter.get('/daily', async (_req, res, next) => {
  try {
    const result = await reportService.getDailyReport();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /reports/monthly
reportRouter.get('/monthly', async (req, res, next) => {
  try {
    const months = Number(req.query.months) || 6;
    const result = await reportService.getMonthlyReport(months);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /reports/realtime-stats — replaces Firestore onSnapshot
reportRouter.get('/realtime-stats', async (_req, res, next) => {
  try {
    const result = await reportService.getRealtimeStats();
    res.json(result);
  } catch (err) {
    next(err);
  }
});
