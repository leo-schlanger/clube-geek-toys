import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import * as notificationService from '../services/notification.service.js';

export const notificationRouter = Router();

// Notificação é sempre do próprio usuário — o id vem do JWT, nunca da query.
notificationRouter.use(authenticate);

// GET /notifications — lista + contador de não lidas (sininho)
notificationRouter.get('/', async (req, res, next) => {
  try {
    res.json(
      await notificationService.listForUser(req.user!.userId, {
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        unreadOnly: req.query.unreadOnly === 'true',
      })
    );
  } catch (err) {
    next(err);
  }
});

// PATCH /notifications/:id/read
notificationRouter.patch('/:id/read', async (req, res, next) => {
  try {
    res.json(await notificationService.markRead(req.user!.userId, req.params.id as string));
  } catch (err) {
    next(err);
  }
});

// POST /notifications/read-all
notificationRouter.post('/read-all', async (req, res, next) => {
  try {
    const updated = await notificationService.markAllRead(req.user!.userId);
    res.json({ updated });
  } catch (err) {
    next(err);
  }
});
