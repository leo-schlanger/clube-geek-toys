import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, optionalAuth } from '../middleware/auth.js';
import { paymentLimiter } from '../middleware/rate-limit.js';
import { validate } from '../middleware/validate.js';
import * as orderService from '../services/order.service.js';

export const orderRouter = Router();

const shippingAddressSchema = z.object({
  cep: z.string().min(8).max(9),
  street: z.string().min(1).max(200),
  number: z.string().min(1).max(20),
  complement: z.string().max(100).optional(),
  neighborhood: z.string().min(1).max(120),
  city: z.string().min(1).max(120),
  state: z.string().min(2).max(2),
  recipientName: z.string().max(200).optional(),
});

const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        // Variant: required when the product has_variants
        variantId: z.string().uuid().optional(),
        // Wholesale may need larger quantities than retail (cap 999)
        quantity: z.number().int().positive().max(999),
      })
    )
    .min(1),
  customer: z.object({
    name: z.string().min(1).max(200),
    email: z.string().email(),
    phone: z.string().max(30).optional(),
  }),
  // Free-text note for the shop ("send more photocards of the same artist").
  // Nothing in the system acts on it — it is for whoever packs the order.
  customerNote: z.string().max(500).optional(),
  // Pickup has no address and no quote — both become optional in the schema
  // and the service, which knows the chosen method, is what requires them.
  deliveryMethod: z.enum(['shipping', 'pickup']).optional(),
  shippingAddress: shippingAddressSchema.optional(),
  shipping: z
    .object({
      quoteToken: z.string().min(10),
      serviceId: z.string().min(1).max(80),
    })
    .optional(),
  paymentMethod: z.enum(['pix', 'credit_card']),
  applyStoreCredit: z.boolean().optional(),
  channel: z.enum(['retail', 'wholesale']).optional(),
  cnpj: z.string().min(14).max(18).optional(),
});

// POST /orders — create order + charge (guest or logged-in member). optionalAuth applies the
// 10% member discount (retail) or 25% wholesale discount (channel=wholesale + approved CNPJ).
orderRouter.post('/', optionalAuth, paymentLimiter, validate(createOrderSchema), async (req, res, next) => {
  try {
    const result = await orderService.createOrder(req.body, req.user);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// ─── Member: my orders ───────────────────────────────────────────────────────
// Must be registered before /:id routes.

const TAB_STATUSES: Record<string, string[] | undefined> = {
  all: undefined,
  to_pay: ['pending'],
  preparing: ['paid', 'processing'],
  on_the_way: ['shipped'],
  finished: ['delivered'],
  cancelled: ['cancelled', 'refunded'],
};

orderRouter.get('/me', authenticate, async (req, res, next) => {
  try {
    const tab = (req.query.tab as string) || 'all';
    const statuses = TAB_STATUSES[tab];
    const result = await orderService.listMyOrders(req.user!.userId, {
      statuses,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

orderRouter.get('/me/:id', authenticate, async (req, res, next) => {
  try {
    const order = await orderService.getMyOrderById(req.user!.userId, req.params.id as string);
    if (!order) {
      res.status(404).json({ error: 'Pedido não encontrado.' });
      return;
    }
    res.json(order);
  } catch (err) {
    next(err);
  }
});

// POST /orders/me/:id/cancel — customer cancels their own unpaid order.
// Under /me so it can never collide with the admin routes below, which are the
// ones allowed to touch a paid order.
orderRouter.post('/me/:id/cancel', authenticate, async (req, res, next) => {
  try {
    res.json(await orderService.cancelMyOrder(req.user!.userId, req.params.id as string));
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

const trackingSchema = z.object({
  trackingCode: z.string().min(5).max(64),
  trackingUrl: z.string().url().optional(),
});

orderRouter.patch('/:id/tracking', authenticate, requireRole('admin'), validate(trackingSchema), async (req, res, next) => {
  try {
    const order = await orderService.setOrderTracking(
      req.params.id as string,
      req.body.trackingCode,
      req.user!.userId,
      req.body.trackingUrl
    );
    res.json(order);
  } catch (err) {
    next(err);
  }
});
