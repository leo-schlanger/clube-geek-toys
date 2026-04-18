import { Router, type Request, type Response } from 'express';
import { authLimiter } from '../middleware/rate-limit.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { z } from 'zod';
import { env } from '../config/env.js';
import * as authService from '../services/auth.service.js';

export const authRouter = Router();

const REFRESH_COOKIE_NAME = 'cgt_refresh';
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Parse cookies from the request header without an external dep.
 * Returns an empty object if there's no cookie header.
 */
function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (!name) continue;
    out[name] = decodeURIComponent(rest.join('='));
  }
  return out;
}

/**
 * Set refresh token as httpOnly cookie. The cookie is scoped to /auth so it's only
 * sent on auth-related requests, minimizing exposure.
 *
 * sameSite: 'lax' is required because frontend (club.geeketoys.com.br) and API
 * (api.geeketoys.com.br) are different origins. 'strict' prevents the cookie from
 * being sent on cross-origin requests between subdomains.
 */
function setRefreshCookie(res: Response, refreshToken: string) {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/auth',
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/auth' });
}

const passwordSchema = z.string().min(8, 'Senha deve ter pelo menos 8 caracteres')
  .regex(/[A-Z]/, 'Senha deve conter pelo menos 1 letra maiúscula')
  .regex(/[0-9]/, 'Senha deve conter pelo menos 1 número');

const registerSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const updateProfileSchema = z.object({
  email: z.string().email().optional(),
  currentPassword: z.string().min(1).optional(),
  newPassword: passwordSchema.optional(),
});

const resetRequestSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string(),
  password: passwordSchema,
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
    setRefreshCookie(res, result.refreshToken);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', authLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';
    const result = await authService.login({ ...req.body, ip });
    setRefreshCookie(res, result.refreshToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/google', authLimiter, validate(googleAuthSchema), async (req, res, next) => {
  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';
    const result = await authService.googleAuth(req.body.idToken, ip);
    setRefreshCookie(res, result.refreshToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Refresh accepts the token from the httpOnly cookie OR (legacy) from the request body.
// Frontend will be migrated to cookie-only in a follow-up deploy.
authRouter.post('/refresh', authLimiter, async (req, res, next) => {
  try {
    const cookies = parseCookies(req);
    const refreshToken = cookies[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token obrigatório', code: 'NO_REFRESH_TOKEN' });
      return;
    }
    const result = await authService.refresh(refreshToken);
    setRefreshCookie(res, result.refreshToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', authenticate, async (req, res, next) => {
  try {
    await authService.logout(req.user!.userId);
    clearRefreshCookie(res);
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
