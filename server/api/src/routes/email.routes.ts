import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { emailLimiter } from '../middleware/rate-limit.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';
import * as emailService from '../services/email.service.js';

export const emailRouter = Router();

const VALID_TEMPLATES = [
  'welcome', 'payment-confirmed', 'payment-failed', 'renewal-reminder',
  'subscription-created', 'subscription-payment',
  'subscription-paused', 'subscription-resumed', 'subscription-cancelled',
  'subscription-payment-failed', 'member-expired',
  'verify-email', 'password-reset', 'contract-signed', 'admin-pix-pending',
  'admin-new-member', 'order-confirmed', 'order-shipped',
] as const;

const sendEmailSchema = z.object({
  template: z.enum(VALID_TEMPLATES),
  to: z.string().email(),
  variables: z.record(z.string().max(500)).optional(),
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

/**
 * POST /email/send — staff only.
 *
 * It used to require nothing but a login, while accepting any template, any
 * recipient and arbitrary variables. Since the mail leaves from the verified
 * `contato@geeketoys.com.br`, any registered account could send a convincing
 * `password-reset` or `verify-email` to anyone. The only legitimate caller is
 * the admin members table.
 */
emailRouter.post('/send', authenticate, requireRole('admin', 'seller'), emailLimiter, validate(sendEmailSchema), async (req, res, next) => {
  try {
    const result = await emailService.sendTemplateEmail(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /email/templates — staff only; nothing outside the admin panel reads it.
emailRouter.get('/templates', authenticate, requireRole('admin', 'seller'), async (_req, res) => {
  res.json({ templates: emailService.getAvailableTemplates() });
});

/**
 * POST /email/send-contract — a member mails their own signed contract.
 *
 * Stays open to members (the signing screen is theirs), but the recipient is
 * no longer theirs to choose: with a free-form `to` plus an arbitrary
 * `pdf_base64`, this was an attachment delivery service on a verified domain.
 * Staff keep the free-form form, since they resend on a member's behalf.
 */
emailRouter.post('/send-contract', authenticate, emailLimiter, validate(sendContractSchema), async (req, res, next) => {
  try {
    const isStaff = req.user?.role === 'admin' || req.user?.role === 'seller';
    const payload = isStaff
      ? req.body
      : { ...req.body, to: req.user!.email, admin_email: undefined };
    const result = await emailService.sendContractEmail(payload);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
