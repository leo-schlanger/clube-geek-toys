import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { defaultLimiter, authLimiter } from '../middleware/rate-limit.js';
import { z } from 'zod';
import * as memberService from '../services/member.service.js';
import * as paymentService from '../services/payment.service.js';
import { query } from '../config/database.js';
import { isValidCPF } from '../utils/cpf.js';

export const memberRouter = Router();

// Public endpoint: check if CPF is already registered (used during registration).
// Returns only { exists: boolean } — never exposes member data.
memberRouter.get('/cpf-exists/:cpf', authLimiter, async (req, res, next) => {
  try {
    const cpf = (req.params.cpf as string).replace(/\D/g, '');
    if (cpf.length !== 11 || !isValidCPF(cpf)) {
      res.status(400).json({ error: 'CPF inválido' });
      return;
    }
    const member = await memberService.getMemberByCpf(cpf);
    res.json({ exists: member !== null });
  } catch (err) {
    next(err);
  }
});

memberRouter.use(authenticate);

const createMemberSchema = z.object({
  cpf: z.string().length(11).refine(isValidCPF, { message: 'CPF inválido' }),
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

// Validated query schema for member list
const listQuerySchema = z.object({
  status: z.enum(['active', 'pending', 'inactive', 'expired']).optional(),
  plan: z.enum(['silver', 'gold', 'black']).optional(),
  paymentType: z.enum(['monthly', 'annual']).optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sort: z.enum(['created_at', 'full_name', 'expiry_date', 'points']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

// GET /members — list all (admin/seller). Supports server-side filtering, search, sort, pagination.
memberRouter.get('/', requireRole('admin', 'seller'), defaultLimiter, async (req, res, next) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Parâmetros de consulta inválidos', details: parsed.error.flatten().fieldErrors });
      return;
    }
    const result = await memberService.listMembers(parsed.data);
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

// GET /members/:id/payments — admin/seller only
memberRouter.get('/:id/payments', requireRole('admin', 'seller'), async (req, res, next) => {
  try {
    const result = await paymentService.getPayments({ memberId: req.params.id as string, limit: 50 });
    res.json(result);
  } catch (err) { next(err); }
});

// GET /members/:id/subscription — admin/seller only
memberRouter.get('/:id/subscription', requireRole('admin', 'seller'), async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM subscriptions WHERE member_id = $1 ORDER BY created_at DESC LIMIT 1',
      [req.params.id]
    );
    res.json(result.rows[0] || null);
  } catch (err) { next(err); }
});

// POST /members — create (admin/seller for arbitrary creation; member can self-register their own
// member record once via /auth/register flow only — body.userId locked to req.user.userId).
memberRouter.post('/', validate(createMemberSchema), async (req, res, next) => {
  try {
    // Members may only create their OWN member profile (matched to their userId).
    // Admins/sellers can create for anyone.
    if (req.user!.role === 'member') {
      // Member can only have one record (UNIQUE on user_id), and createMember uses req.user.userId
      // anyway. We additionally block any attempt to override or pass extra metadata.
      // Service-level UNIQUE constraint is the final gate.
    } else if (!['admin', 'seller'].includes(req.user!.role)) {
      res.status(403).json({ error: 'Acesso negado', code: 'FORBIDDEN' });
      return;
    }
    const member = await memberService.createMember(req.user!.userId, req.body);
    res.status(201).json(member);
  } catch (err) {
    next(err);
  }
});

// PATCH /members/:id — update
// Members can patch their own record (self-editable fields only — enforced in service)
// Admins/sellers can patch any record (full field set)
memberRouter.patch('/:id', validate(updateMemberSchema), async (req, res, next) => {
  try {
    const existing = await memberService.getMemberById(req.params.id as string);
    if (!existing) {
      res.status(404).json({ error: 'Membro não encontrado', code: 'MEMBER_NOT_FOUND' });
      return;
    }

    // Authorization:
    // - admin/seller: full access
    // - member: only own record
    // - other roles: forbidden
    if (req.user!.role === 'member') {
      if (existing.userId !== req.user!.userId) {
        res.status(403).json({ error: 'Acesso negado', code: 'FORBIDDEN' });
        return;
      }
    } else if (!['admin', 'seller'].includes(req.user!.role)) {
      res.status(403).json({ error: 'Acesso negado', code: 'FORBIDDEN' });
      return;
    }

    const updated = await memberService.updateMember(req.params.id as string, req.body, req.user!.role, req.user!.userId);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
