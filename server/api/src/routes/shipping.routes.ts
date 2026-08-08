import { Router } from 'express';
import { z } from 'zod';
import { publicLookupLimiter } from '../middleware/rate-limit.js';
import { validate } from '../middleware/validate.js';
import * as shippingService from '../services/shipping.service.js';

export const shippingRouter = Router();

const quoteSchema = z.object({
  cep: z.string().min(8).max(9),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive().max(99),
      })
    )
    .min(1)
    .max(50),
});

// GET /shipping/cep/:cep — ViaCEP proxy
shippingRouter.get('/cep/:cep', publicLookupLimiter, async (req, res, next) => {
  try {
    const result = await shippingService.lookupCep(req.params.cep as string);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /shipping/quote — Melhor Envio (or fallback table)
shippingRouter.post('/quote', publicLookupLimiter, validate(quoteSchema), async (req, res, next) => {
  try {
    const result = await shippingService.quoteShipping(req.body.cep, req.body.items);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
