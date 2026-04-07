import { Router } from 'express';
import { authLimiter } from '../middleware/rate-limit.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { z } from 'zod';
import * as authService from '../services/auth.service.js';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const updateProfileSchema = z.object({
  email: z.string().email().optional(),
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(6).optional(),
});

const resetRequestSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(6),
});

const verifyEmailSchema = z.object({
  token: z.string(),
});

const googleAuthSchema = z.object({
  idToken: z.string().min(1),
});

const sendVerificationSchema = z.object({
  email: z.string().email(),
  uid: z.string().optional(),
  name: z.string().optional(),
});

authRouter.post('/register', authLimiter, validate(registerSchema), async (req, res, next) => {
  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';
    const result = await authService.register({ ...req.body, ip });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', authLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';
    const result = await authService.login({ ...req.body, ip });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/google', authLimiter, validate(googleAuthSchema), async (req, res, next) => {
  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';
    const result = await authService.googleAuth(req.body.idToken, ip);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token obrigatório' });
      return;
    }
    const result = await authService.refresh(refreshToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', authenticate, async (req, res, next) => {
  try {
    await authService.logout(req.user!.userId);
    res.json({ message: 'Logout realizado' });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await authService.getMe(req.user!.userId);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

authRouter.patch('/update-profile', authenticate, validate(updateProfileSchema), async (req, res, next) => {
  try {
    const result = await authService.updateProfile(req.user!.userId, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/send-verification-email', authLimiter, validate(sendVerificationSchema), async (req, res, next) => {
  try {
    await authService.sendVerificationEmail(req.body);
    res.json({ message: 'Email de verificação enviado' });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/verify-email', authLimiter, validate(verifyEmailSchema), async (req, res, next) => {
  try {
    const result = await authService.verifyEmail(req.body.token);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/send-password-reset', authLimiter, validate(resetRequestSchema), async (req, res, next) => {
  try {
    await authService.sendPasswordReset(req.body.email);
    res.json({ message: 'Email de recuperação enviado' });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/reset-password', authLimiter, validate(resetPasswordSchema), async (req, res, next) => {
  try {
    await authService.resetPassword(req.body.token, req.body.password);
    res.json({ message: 'Senha redefinida com sucesso' });
  } catch (err) {
    next(err);
  }
});
