import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { verifyMemberOwnership } from '../middleware/ownership.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';
import * as pointsService from '../services/points.service.js';

export const pointsRouter = Router();
pointsRouter.use(authenticate);

const earnSchema = z.object({
  purchaseValue: z.number().positive().multipleOf(0.01),
  isPromotion: z.boolean().default(false),
});

const bonusSchema = z.object({
  points: z.number().int().positive().max(50000),
  reason: z.string().min(1).max(500),
});

const redeemSchema = z.object({
  ruleId: z.string().max(50),
  points: z.number().int().positive(),
  description: z.string().max(500),
});

// GET /points/:memberId/history
pointsRouter.get('/:memberId/history', async (req, res, next) => {
  try {
    if (!await verifyMemberOwnership(req, res, req.params.memberId)) return;
    const limit = Number(req.query.limit) || 50;
    const result = await pointsService.getPointsHistory(req.params.memberId as string, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /points/:memberId/expiring
pointsRouter.get('/:memberId/expiring', async (req, res, next) => {
  try {
    if (!await verifyMemberOwnership(req, res, req.params.memberId)) return;
    const result = await pointsService.getExpiringPoints(req.params.memberId as string);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /points/:memberId/balance
pointsRouter.get('/:memberId/balance', async (req, res, next) => {
  try {
    if (!await verifyMemberOwnership(req, res, req.params.memberId)) return;
    const result = await pointsService.getBalance(req.params.memberId as string);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /points/:memberId/earn
pointsRouter.post('/:memberId/earn', requireRole('seller', 'admin'), validate(earnSchema), async (req, res, next) => {
  try {
    const result = await pointsService.earnPoints(
      req.params.memberId as string,
      req.body.purchaseValue,
      req.body.isPromotion,
      req.user!.userId
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// POST /points/:memberId/bonus
pointsRouter.post('/:memberId/bonus', requireRole('admin'), validate(bonusSchema), async (req, res, next) => {
  try {
    const result = await pointsService.addBonusPoints(
      req.params.memberId as string,
      req.body.points,
      req.body.reason,
      req.user!.userId
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// POST /points/:memberId/redeem
pointsRouter.post('/:memberId/redeem', requireRole('seller', 'admin'), validate(redeemSchema), async (req, res, next) => {
  try {
    const result = await pointsService.redeemPoints(
      req.params.memberId as string,
      req.body.points,
      req.body.description,
      req.user!.userId
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});
