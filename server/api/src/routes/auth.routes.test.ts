import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Auth routes over real HTTP.
 *
 * What these pin:
 *  1. The refresh token travels as an httpOnly cookie scoped to /auth — never
 *     readable by page script — and refresh reads it from there.
 *  2. Password rules are enforced before the service: 8+ chars, a capital and
 *     a digit.
 *  3. Logout signs out this device (the cookie's session) and clears the cookie.
 *  4. The real client IP (first X-Forwarded-For hop) reaches the service.
 */

vi.mock('../config/env.js', async () => (await import('../test-support/env.js')).envModule);
vi.mock('../middleware/rate-limit.js', async () => (await import('../test-support/env.js')).rateLimitModule);
vi.mock('../services/log.service.js', () => ({ createErrorLog: vi.fn(async () => {}) }));

const auth = vi.hoisted(() => ({
  register: vi.fn(),
  login: vi.fn(),
  googleAuth: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
  getMe: vi.fn(),
  updateProfile: vi.fn(),
  sendVerificationEmail: vi.fn(),
  verifyEmail: vi.fn(),
  sendPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
}));
vi.mock('../services/auth.service.js', () => auth);

import { authRouter } from './auth.routes.js';
import { routerClient } from '../test-support/http.js';

const api = routerClient('/auth', authRouter);
const session = { accessToken: 'acc', refreshToken: 'ref-123', user: { id: 'u1' } };

beforeEach(() => vi.clearAllMocks());

describe('sign-in', () => {
  it('logs in, passing the real client IP, and sets the refresh cookie', async () => {
    auth.login.mockResolvedValue(session);
    const res = await api.post('/login', {
      body: { email: 'laura@example.com', password: 'x' },
      headers: { 'X-Forwarded-For': '177.1.2.3, 10.0.0.1', 'User-Agent': 'Test/1.0' },
    });
    expect(res.status).toBe(200);
    expect(auth.login).toHaveBeenCalledWith(expect.objectContaining({ ip: '177.1.2.3', userAgent: 'Test/1.0' }));
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('cgt_refresh=ref-123');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/auth');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('registers only with a strong enough password', async () => {
    auth.register.mockResolvedValue(session);
    expect((await api.post('/register', { body: { email: 'a@example.com', password: 'Segura123' } })).status).toBe(201);
    for (const password of ['curta1A', 'semmaiuscula1', 'SemNumero']) {
      expect((await api.post('/register', { body: { email: 'a@example.com', password } })).status, password).toBe(400);
    }
    expect(auth.register).toHaveBeenCalledTimes(1);
  });

  it('signs in with Google', async () => {
    auth.googleAuth.mockResolvedValue(session);
    expect((await api.post('/google', { body: { idToken: 'g-token' } })).status).toBe(200);
    expect(auth.googleAuth).toHaveBeenCalledWith('g-token', expect.any(String), expect.any(String));
    expect((await api.post('/google', { body: { idToken: '' } })).status).toBe(400);
  });
});

describe('session', () => {
  it('refreshes from the cookie, falling back to the body, and 400 with neither', async () => {
    auth.refresh.mockResolvedValue({ ...session, refreshToken: 'ref-456' });
    const fromCookie = await api.post('/refresh', { headers: { Cookie: 'other=1; cgt_refresh=ref-123' } });
    expect(fromCookie.status).toBe(200);
    expect(auth.refresh).toHaveBeenCalledWith('ref-123', expect.any(String));
    expect(fromCookie.headers.get('set-cookie')).toContain('cgt_refresh=ref-456');

    await api.post('/refresh', { body: { refreshToken: 'legacy' } });
    expect(auth.refresh).toHaveBeenLastCalledWith('legacy', expect.any(String));

    expect((await api.post('/refresh', { body: {} })).body.code).toBe('NO_REFRESH_TOKEN');
  });

  it('logs out this device and clears the cookie', async () => {
    expect((await api.post('/logout')).status).toBe(401);
    const res = await api.post('/logout', { as: 'member', headers: { Cookie: 'cgt_refresh=ref-123' } });
    expect(auth.logout).toHaveBeenCalledWith('user-member', 'ref-123');
    expect(res.headers.get('set-cookie')).toMatch(/cgt_refresh=;.*Expires=Thu, 01 Jan 1970/);
  });

  it('returns the current user and updates e-mail or password', async () => {
    auth.getMe.mockResolvedValue({ id: 'user-member' });
    expect((await api.get('/me', { as: 'member' })).body).toEqual({ id: 'user-member' });
    expect(auth.getMe).toHaveBeenCalledWith('user-member');

    auth.updateProfile.mockResolvedValue({ ok: true });
    await api.patch('/update-profile', { as: 'member', body: { currentPassword: 'x', newPassword: 'NovaSenha1' } });
    expect(auth.updateProfile).toHaveBeenCalledWith('user-member', { currentPassword: 'x', newPassword: 'NovaSenha1' });
    expect((await api.patch('/update-profile', { as: 'member', body: { newPassword: 'fraca' } })).status).toBe(400);
  });
});

describe('e-mail flows', () => {
  it('sends verification, verifies, sends a reset and resets', async () => {
    expect((await api.post('/send-verification-email', { body: { email: 'a@example.com' } })).status).toBe(200);
    auth.verifyEmail.mockResolvedValue({ verified: true });
    expect((await api.post('/verify-email', { body: { token: 't' } })).body).toEqual({ verified: true });
    expect((await api.post('/send-password-reset', { body: { email: 'a@example.com' } })).status).toBe(200);
    expect((await api.post('/reset-password', { body: { token: 't', password: 'NovaSenha1' } })).status).toBe(200);
    expect(auth.resetPassword).toHaveBeenCalledWith('t', 'NovaSenha1');
    expect((await api.post('/reset-password', { body: { token: 't', password: 'fraca' } })).status).toBe(400);
    expect((await api.post('/send-password-reset', { body: { email: 'nope' } })).status).toBe(400);
  });

  it('passes a service error through the error handler', async () => {
    auth.login.mockRejectedValue(new Error('db down'));
    expect((await api.post('/login', { body: { email: 'a@example.com', password: 'x' } })).status).toBe(500);
  });
});
