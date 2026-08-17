import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as stockService from '../services/stock.service.js';

export const stockRouter = Router();

// Stock is operational data: admin only, on every route.
stockRouter.use(authenticate, requireRole('admin'));

const FILTERS = new Set(['all', 'low', 'out']);

// GET /stock — one row per sellable SKU (plain product or variant)
stockRouter.get('/', async (req, res, next) => {
  try {
    const filter = FILTERS.has(String(req.query.filter))
      ? (req.query.filter as 'all' | 'low' | 'out')
      : 'all';
    res.json(
      await stockService.listStock({
        search: req.query.search as string | undefined,
        filter,
        includeInactive: req.query.includeInactive === 'true',
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      })
    );
  } catch (err) {
    next(err);
  }
});

const adjustSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  stock: z.number().int().nonnegative().max(1_000_000),
  note: z.string().max(500).optional().nullable(),
});

// PATCH /stock — sets a SKU's stock and records the adjustment
stockRouter.patch('/', validate(adjustSchema), async (req, res, next) => {
  try {
    res.json(await stockService.adjustStock(req.body, req.user!.userId));
  } catch (err) {
    next(err);
  }
});

const thresholdSchema = z.object({
  threshold: z.number().int().nonnegative().max(10_000),
});

// PATCH /stock/:productId/threshold — limiar de "acabando"
stockRouter.patch(
  '/:productId/threshold',
  validate(thresholdSchema),
  async (req, res, next) => {
    try {
      await stockService.setLowStockThreshold(
        req.params.productId as string,
        req.body.threshold,
        req.user!.userId
      );
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }
);

// GET /stock/:productId/movements — product history, variants included
stockRouter.get('/:productId/movements', async (req, res, next) => {
  try {
    const movements = await stockService.listMovements(req.params.productId as string, {
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json({ movements });
  } catch (err) {
    next(err);
  }
});
