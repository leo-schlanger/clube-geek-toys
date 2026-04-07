import { Router, Request, Response, NextFunction } from 'express';
import * as webhookService from '../services/webhook.service.js';

export const webhookRouter = Router();

// POST /webhook/pagbank — PagBank sends full order data in JSON body
webhookRouter.post('/pagbank', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawBody = req.body as Buffer;
    const requestId = req.headers['x-request-id'] as string || '';

    const body = JSON.parse(rawBody.toString());

    await webhookService.processWebhook({
      body,
      requestId,
    });

    res.status(200).json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});
