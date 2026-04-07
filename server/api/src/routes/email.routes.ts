import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { emailLimiter } from '../middleware/rate-limit.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';
import * as emailService from '../services/email.service.js';

export const emailRouter = Router();

const sendEmailSchema = z.object({
  template: z.string(),
  to: z.string().email(),
  variables: z.record(z.string()).optional(),
  member_id: z.string().optional(),
});

const sendContractSchema = z.object({
  to: z.string().email(),
  member_name: z.string(),
  plan: z.string(),
  signed_at: z.string(),
  hash: z.string(),
  pdf_base64: z.string(),
  admin_email: z.string().email().optional(),
});

// POST /email/send
emailRouter.post('/send', authenticate, emailLimiter, validate(sendEmailSchema), async (req, res, next) => {
  try {
    const result = await emailService.sendTemplateEmail(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /email/templates
emailRouter.get('/templates', authenticate, async (_req, res) => {
  res.json({ templates: emailService.getAvailableTemplates() });
});

// POST /email/send-contract
emailRouter.post('/send-contract', authenticate, emailLimiter, validate(sendContractSchema), async (req, res, next) => {
  try {
    const result = await emailService.sendContractEmail(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
