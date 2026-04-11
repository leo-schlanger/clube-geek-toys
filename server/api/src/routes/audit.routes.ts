import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { auditLog } from '../utils/audit.js';

export const auditRouter = Router();
auditRouter.use(authenticate, requireRole('admin'));

// POST /audit/export — admin posts a record any time they download CSV/Excel data
const exportSchema = z.object({
  resource: z.string().min(1).max(100),
  count: z.number().int().nonnegative(),
  filters: z.record(z.string(), z.unknown()).optional(),
});

auditRouter.post('/export', validate(exportSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof exportSchema>;
    await auditLog('export.created', req.user!.userId, {
      resource: body.resource,
      count: body.count,
      filters: body.filters || null,
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});
