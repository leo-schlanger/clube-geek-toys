import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rate-limit.js';
import * as wholesaleService from '../services/wholesale.service.js';

export const wholesaleRouter = Router();

const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  cnpj: z.string().min(14).max(18),
  companyName: z.string().min(1).max(200),
  tradeName: z.string().max(200).optional(),
  stateRegistration: z.string().max(40).optional(),
  phone: z.string().max(20).optional(),
  contactName: z.string().min(1).max(200),
  businessActivity: z.string().max(2000).optional(),
});

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
  cnpj: z.string().min(14).max(18),
});

const reviewSchema = z.object({
  action: z.enum(['approve', 'reject', 'disable']),
  rejectionReason: z.string().max(1000).optional(),
  adminNotes: z.string().max(2000).optional(),
});

// POST /wholesale/register
wholesaleRouter.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  async (req, res, next) => {
    try {
      const result = await wholesaleService.registerWholesale({
        ...req.body,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /wholesale/login — requires correct CNPJ
wholesaleRouter.post('/login', authLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const result = await wholesaleService.loginWholesale({
      ...req.body,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /wholesale/status — público: a loja precisa saber se o canal aceita pedidos
wholesaleRouter.get('/status', async (_req, res, next) => {
  try {
    res.json({ salesOpen: await wholesaleService.isWholesaleSalesOpen() });
  } catch (err) {
    next(err);
  }
});

// GET /wholesale/me — current user's wholesale account
wholesaleRouter.get('/me', authenticate, async (req, res, next) => {
  try {
    const account = await wholesaleService.getAccountByUserId(req.user!.userId);
    if (!account) {
      res.status(404).json({ error: 'Sem cadastro de atacado.', code: 'NOT_WHOLESALE' });
      return;
    }
    res.json(account);
  } catch (err) {
    next(err);
  }
});

// GET /wholesale/accounts — admin list
wholesaleRouter.get('/accounts', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const status = req.query.status as wholesaleService.WholesaleStatus | undefined;
    const result = await wholesaleService.listAccounts({
      status: status && ['pending', 'approved', 'rejected', 'disabled'].includes(status) ? status : undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// PATCH /wholesale/accounts/:id — admin approve/reject/disable
wholesaleRouter.patch(
  '/accounts/:id',
  authenticate,
  requireRole('admin'),
  validate(reviewSchema),
  async (req, res, next) => {
    try {
      const account = await wholesaleService.reviewAccount(
        req.params.id as string,
        req.body.action,
        req.user!.userId,
        {
          rejectionReason: req.body.rejectionReason,
          adminNotes: req.body.adminNotes,
        }
      );
      res.json(account);
    } catch (err) {
      next(err);
    }
  }
);
