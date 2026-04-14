import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rate-limit.js';
import * as lgpdService from '../services/lgpd.service.js';

export const lgpdRouter = Router();
lgpdRouter.use(authenticate);

// GET /lgpd/export — export all user data (LGPD)
lgpdRouter.get('/export', async (req, res, next) => {
  try {
    const data = await lgpdService.exportUserData(req.user!.userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /lgpd/delete-account — anonymize and delete account (LGPD)
lgpdRouter.post('/delete-account', authLimiter, async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password || typeof password !== 'string') {
      res.status(400).json({ error: 'Senha é obrigatória para confirmar a exclusão' });
      return;
    }
    const result = await lgpdService.deleteUserAccount(req.user!.userId, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
