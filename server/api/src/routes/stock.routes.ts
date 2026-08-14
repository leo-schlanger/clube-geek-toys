import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as stockService from '../services/stock.service.js';

export const stockRouter = Router();

// Estoque é dado operacional: admin apenas, em todas as rotas.
stockRouter.use(authenticate, requireRole('admin'));

const FILTERS = new Set(['all', 'low', 'out']);

// GET /stock — uma linha por SKU vendável (produto simples ou variação)
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

// PATCH /stock — define o estoque de um SKU (grava o ajuste no histórico)
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

// GET /stock/:productId/movements — histórico do produto (inclui variações)
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
