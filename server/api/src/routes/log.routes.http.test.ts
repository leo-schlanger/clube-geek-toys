import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Log routes over real HTTP. The intake is public (the storefront reports its
 * own errors) and drops crawlers and browser extensions; reading the logs is
 * admin-only. A logged-in report is tied to the user; a bad token is still
 * logged, anonymously.
 */

vi.mock('../config/env.js', async () => (await import('../test-support/env.js')).envModule);
vi.mock('../middleware/rate-limit.js', async () => (await import('../test-support/env.js')).rateLimitModule);

const logs = vi.hoisted(() => ({
  createErrorLog: vi.fn(async () => {}),
  getAuditLogs: vi.fn(async () => []),
  getEmailLogs: vi.fn(async () => []),
  getErrorLogs: vi.fn(async () => []),
  getErrorStats: vi.fn(async () => ({ total: 3 })),
}));
vi.mock('../services/log.service.js', () => logs);
vi.mock('../db/ensure-schema.js', () => ({ getSchemaState: () => ({ status: 'ok', total: 37 }) }));

import { logRouter } from './log.routes.js';
import { routerClient, tokenFor } from '../test-support/http.js';

const api = routerClient('/logs', logRouter);
const PERSON = 'Mozilla/5.0 (Linux; Android 16; motorola edge 60) Chrome/154.0 Mobile Safari/537.36';

beforeEach(() => vi.clearAllMocks());

describe('intake', () => {
  it('logs what a person saw, tied to the account when logged in', async () => {
    const res = await api.post('/errors', {
      body: { message: 'TypeError: x', url: 'https://shop/evento' },
      headers: { 'User-Agent': PERSON, Authorization: `Bearer ${tokenFor('member')}` },
    });
    expect(res.status).toBe(201);
    expect(logs.createErrorLog).toHaveBeenCalledWith(expect.objectContaining({
      severity: 'error', message: 'TypeError: x', source: 'frontend', userId: 'user-member', userAgent: PERSON,
    }));
  });

  it('still logs with an invalid token, without a user', async () => {
    await api.post('/errors', { body: { message: 'x' }, headers: { 'User-Agent': PERSON, Authorization: 'Bearer nope' } });
    expect(logs.createErrorLog).toHaveBeenCalledWith(expect.objectContaining({ userId: undefined }));
  });

  it('drops crawlers and browser extensions without an error', async () => {
    const bot = await api.post('/errors', { body: { message: 'Rejected' }, headers: { 'User-Agent': 'Googlebot/2.1' } });
    expect(bot.body).toEqual({ logged: false, reason: 'crawler' });
    const ext = await api.post('/errors', { body: { message: 'x', stack: 'at chrome-extension://abc/x.js' }, headers: { 'User-Agent': PERSON } });
    expect(ext.body.reason).toBe('browser_extension');
    expect(logs.createErrorLog).not.toHaveBeenCalled();
  });

  it('refuses an oversized or empty report', async () => {
    expect((await api.post('/errors', { body: { message: '' }, headers: { 'User-Agent': PERSON } })).status).toBe(400);
    expect((await api.post('/errors', { body: { message: 'x'.repeat(5001) }, headers: { 'User-Agent': PERSON } })).status).toBe(400);
  });
});

describe('reading', () => {
  it('is admin-only', async () => {
    expect((await api.get('/errors')).status).toBe(401);
    expect((await api.get('/audit', { as: 'seller' })).status).toBe(403);
  });

  it('serves the schema state and each log, with filters', async () => {
    expect((await api.get('/schema', { as: 'admin' })).body).toEqual({ status: 'ok', total: 37 });
    await api.get('/audit?memberId=m1&limit=10', { as: 'admin' });
    expect(logs.getAuditLogs).toHaveBeenCalledWith({ memberId: 'm1', limit: 10 });
    await api.get('/email', { as: 'admin' });
    expect(logs.getEmailLogs).toHaveBeenCalledWith({ memberId: undefined, limit: 50 });
    await api.get('/errors?severity=fatal&source=backend', { as: 'admin' });
    expect(logs.getErrorLogs).toHaveBeenCalledWith({ severity: 'fatal', source: 'backend', limit: 50 });
    expect((await api.get('/errors/stats', { as: 'admin' })).body).toEqual({ total: 3 });
  });
});
