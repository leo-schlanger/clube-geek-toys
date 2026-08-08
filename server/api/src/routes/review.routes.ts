import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { publicLookupLimiter } from '../middleware/rate-limit.js';
import * as reviewService from '../services/review.service.js';
import * as storeCreditService from '../services/store-credit.service.js';

export const reviewRouter = Router();

// GET /reviews/product/:slugOrId — public published reviews
reviewRouter.get('/product/:slugOrId', publicLookupLimiter, async (req, res, next) => {
  try {
    const result = await reviewService.listProductReviews(req.params.slugOrId as string, {
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /reviews/me/credit — store credit balance
reviewRouter.get('/me/credit', authenticate, async (req, res, next) => {
  try {
    const balance = await storeCreditService.getBalance(req.user!.userId);
    const rewardAmount = await storeCreditService.getReviewRewardAmount();
    res.json({ balance, rewardAmount });
  } catch (err) {
    next(err);
  }
});

// GET /reviews/me/order/:orderId — which products already reviewed
reviewRouter.get('/me/order/:orderId', authenticate, async (req, res, next) => {
  try {
    const reviews = await reviewService.listReviewsForOrder(
      req.user!.userId,
      req.params.orderId as string
    );
    res.json({ reviews });
  } catch (err) {
    next(err);
  }
});

const createReviewsSchema = z.object({
  reviews: z
    .array(
      z.object({
        productId: z.string().uuid(),
        rating: z.number().int().min(1).max(5),
        title: z.string().max(120).optional(),
        body: z.string().max(2000).optional(),
      })
    )
    .min(1)
    .max(20),
});

// POST /reviews/me/order/:orderId — create reviews + maybe credit
reviewRouter.post(
  '/me/order/:orderId',
  authenticate,
  validate(createReviewsSchema),
  async (req, res, next) => {
    try {
      const result = await reviewService.createOrderReviews(
        req.user!.userId,
        req.params.orderId as string,
        req.body.reviews
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// ─── Admin ───────────────────────────────────────────────────────────────────

reviewRouter.get('/', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const result = await reviewService.adminListReviews({
      status: req.query.status as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const statusSchema = z.object({
  status: z.enum(['published', 'hidden', 'pending']),
});

reviewRouter.patch(
  '/:id/status',
  authenticate,
  requireRole('admin'),
  validate(statusSchema),
  async (req, res, next) => {
    try {
      const review = await reviewService.adminSetReviewStatus(
        req.params.id as string,
        req.body.status,
        req.user!.userId
      );
      res.json(review);
    } catch (err) {
      next(err);
    }
  }
);
