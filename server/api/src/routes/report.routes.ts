import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import * as reportService from '../services/report.service.js';

export const reportRouter = Router();
reportRouter.use(authenticate, requireRole('admin'));

function parseMonths(raw: unknown): number {
  const requested = Number(raw) || 6;
  return Math.max(1, Math.min(requested, 24));
}

// GET /reports/daily
reportRouter.get('/daily', async (_req, res, next) => {
  try {
    const result = await reportService.getDailyReport();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /reports/monthly?months=6
reportRouter.get('/monthly', async (req, res, next) => {
  try {
    const months = parseMonths(req.query.months);
    const result = await reportService.getMonthlyReport(months);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /reports/churn?months=6 — expired + cancelled members grouped by month
reportRouter.get('/churn', async (req, res, next) => {
  try {
    const months = parseMonths(req.query.months);
    const result = await reportService.getChurnReport(months);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /reports/plan-distribution — single club plan with real counts/revenue
reportRouter.get('/plan-distribution', async (_req, res, next) => {
  try {
    const result = await reportService.getPlanDistribution();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /reports/today-revenue — sum of paid payments today
reportRouter.get('/today-revenue', async (_req, res, next) => {
  try {
    const result = await reportService.getTodayRevenue();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /reports/realtime-stats — dashboard polling
reportRouter.get('/realtime-stats', async (_req, res, next) => {
  try {
    const result = await reportService.getRealtimeStats();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /reports/action-items — everything waiting on an admin, for the day panel
reportRouter.get('/action-items', async (_req, res, next) => {
  try {
    const result = await reportService.getActionItems();
    res.json(result);
  } catch (err) {
    next(err);
  }
});
