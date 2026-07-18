import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, optionalAuth } from '../middleware/auth.js';
import { paymentLimiter } from '../middleware/rate-limit.js';
import { validate } from '../middleware/validate.js';
import * as orderService from '../services/order.service.js';

export const orderRouter = Router();

const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive().max(99),
      })
    )
    .min(1),
  customer: z.object({
    name: z.string().min(1).max(200),
    email: z.string().email(),
    phone: z.string().max(30).optional(),
  }),
  shippingAddress: z.record(z.string(), z.unknown()).optional(),
  paymentMethod: z.enum(['pix', 'credit_card']),
});

// POST /orders — create order + charge (guest or logged-in member). optionalAuth applies the
// 15% member discount server-side when an active member is authenticated.
orderRouter.post('/', optionalAuth, paymentLimiter, validate(createOrderSchema), async (req, res, next) => {
  try {
    const result = await orderService.createOrder(req.body, req.user);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// GET /orders/:id/status — public polling for the order-confirmation page.
orderRouter.get('/:id/status', async (req, res, next) => {
  try {
    const status = await orderService.getOrderStatus(req.params.id as string);
    if (!status) {
      res.status(404).json({ error: 'Pedido não encontrado.' });
      return;
    }
    res.json(status);
  } catch (err) {
    next(err);
  }
});

// ─── Admin ───────────────────────────────────────────────────────────────────

orderRouter.get('/', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const result = await orderService.listOrders({
      status: req.query.status as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

orderRouter.get('/:id', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const order = await orderService.getOrderById(req.params.id as string, true);
    if (!order) {
      res.status(404).json({ error: 'Pedido não encontrado.' });
      return;
    }
    res.json(order);
  } catch (err) {
    next(err);
  }
});

const statusSchema = z.object({
  status: z.enum(['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']),
});

orderRouter.patch('/:id/status', authenticate, requireRole('admin'), validate(statusSchema), async (req, res, next) => {
  try {
    const order = await orderService.updateOrderStatus(req.params.id as string, req.body.status, req.user!.userId);
    res.json(order);
  } catch (err) {
    next(err);
  }
});

orderRouter.post('/:id/confirm-pix', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const order = await orderService.confirmPixOrder(req.params.id as string, req.user!.userId);
    res.json(order);
  } catch (err) {
    next(err);
  }
});

orderRouter.post('/:id/refund', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const order = await orderService.refundOrder(req.params.id as string, req.user!.userId);
    res.json(order);
  } catch (err) {
    next(err);
  }
});
