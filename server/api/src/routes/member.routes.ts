import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { defaultLimiter } from '../middleware/rate-limit.js';
import { z } from 'zod';
import * as memberService from '../services/member.service.js';

export const memberRouter = Router();
memberRouter.use(authenticate);

const createMemberSchema = z.object({
  cpf: z.string().length(11),
  fullName: z.string().min(3).max(200),
  email: z.string().email(),
  phone: z.string().optional(),
  plan: z.enum(['silver', 'gold', 'black']),
  paymentType: z.enum(['monthly', 'annual']),
});

const updateMemberSchema = z.object({
  fullName: z.string().min(3).max(200).optional(),
  phone: z.string().optional(),
  photoUrl: z.string().optional(),
  plan: z.enum(['silver', 'gold', 'black']).optional(),
  status: z.enum(['active', 'pending', 'inactive', 'expired']).optional(),
  paymentType: z.enum(['monthly', 'annual']).optional(),
  startDate: z.string().optional(),
  expiryDate: z.string().optional(),
  points: z.number().optional(),
  pendingPayment: z.any().optional(),
  subscriptionId: z.string().nullable().optional(),
  subscriptionStatus: z.string().nullable().optional(),
  autoRenewal: z.boolean().optional(),
  activatedAt: z.string().nullable().optional(),
  activatedByPayment: z.string().nullable().optional(),
}).strict();

// GET /members — list all (admin/seller)
memberRouter.get('/', requireRole('admin', 'seller'), defaultLimiter, async (req, res, next) => {
  try {
    const result = await memberService.listMembers({
      status: req.query.status as string | undefined,
      plan: req.query.plan as string | undefined,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 50,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /members/me — own member profile
memberRouter.get('/me', async (req, res, next) => {
  try {
    const member = await memberService.getMemberByUserId(req.user!.userId);
    if (!member) {
      res.status(404).json({ error: 'Membro não encontrado' });
      return;
    }
    res.json(member);
  } catch (err) {
    next(err);
  }
});

// GET /members/count
memberRouter.get('/count', requireRole('admin', 'seller'), async (_req, res, next) => {
  try {
    const count = await memberService.getMembersCount();
    res.json({ count });
  } catch (err) {
    next(err);
  }
});

// GET /members/by-cpf/:cpf
memberRouter.get('/by-cpf/:cpf', requireRole('admin', 'seller'), async (req, res, next) => {
  try {
    const member = await memberService.getMemberByCpf(req.params.cpf as string);
    if (!member) {
      res.status(404).json({ error: 'Membro não encontrado' });
      return;
    }
    res.json(member);
  } catch (err) {
    next(err);
  }
});

// GET /members/:id
memberRouter.get('/:id', async (req, res, next) => {
  try {
    const member = await memberService.getMemberById(req.params.id as string);
    if (!member) {
      res.status(404).json({ error: 'Membro não encontrado' });
      return;
    }
    // Members can only see their own profile
    if (req.user!.role === 'member' && member.userId !== req.user!.userId) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }
    res.json(member);
  } catch (err) {
    next(err);
  }
});

// POST /members — create
memberRouter.post('/', validate(createMemberSchema), async (req, res, next) => {
  try {
    const member = await memberService.createMember(req.user!.userId, req.body);
    res.status(201).json(member);
  } catch (err) {
    next(err);
  }
});

// PATCH /members/:id — update
memberRouter.patch('/:id', validate(updateMemberSchema), async (req, res, next) => {
  try {
    // Check access
    const existing = await memberService.getMemberById(req.params.id as string);
    if (!existing) {
      res.status(404).json({ error: 'Membro não encontrado' });
      return;
    }
    if (req.user!.role === 'member' && existing.userId !== req.user!.userId) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }
    const updated = await memberService.updateMember(req.params.id as string, req.body, req.user!.role);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
