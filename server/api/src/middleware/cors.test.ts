import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

// Production config: only the listed pages get CORS with credentials.
vi.mock('../config/env.js', () => ({
  env: { NODE_ENV: 'production', FRONTEND_URL: 'https://club.geeketoys.com.br', ALLOWED_ORIGINS: undefined },
}));

const { corsMiddleware, SITE_ORIGINS } = await import('./cors.js');

let server: Server;
let base = '';
beforeAll(async () => {
  const app = express();
  app.use(corsMiddleware);
  app.get('/x', (_req, res) => { res.json({ ok: true }); });
  // Rejected origins surface as an error without CORS headers.
  app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(403).end();
  });
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const call = async (origin: string, method = 'GET') => {
  const res = await fetch(`${base}/x`, {
    method,
    headers: { Origin: origin, ...(method === 'OPTIONS' ? { 'Access-Control-Request-Method': 'POST' } : {}) },
  });
  return { acao: res.headers.get('access-control-allow-origin'), creds: res.headers.get('access-control-allow-credentials') };
};

// Real callers (nginx Referer of api.* over 30 days, 27/11/2026).
const ALLOWED = [
  'https://club.geeketoys.com.br', 'https://adm.geeketoys.com.br', 'https://shop.geeketoys.com.br',
  'https://club.geekpoptoys.com.br', 'https://adm.geekpoptoys.com.br', 'https://shop.geekpoptoys.com.br',
  'https://geekpoptoys.com.br', 'https://www.geekpoptoys.com.br', 'https://www.geeketoys.com.br',
  'https://geeketoys.com.br',
];

const DENIED = [
  'https://naoexiste.geeketoys.com.br', 'https://naoexiste.geekpoptoys.com.br',
  'https://radio.geeketoys.com.br', 'https://radio.geekpoptoys.com.br',
  'https://analytics.geeketoys.com.br', 'https://api.geeketoys.com.br',
  'https://admin.geeketoys.com.br', 'https://a.b.shop.geekpoptoys.com.br',
  'null', 'http://shop.geekpoptoys.com.br', 'http://geekpoptoys.com.br',
  'https://shop.geekpoptoys.com.br.evil.com', 'https://evilgeekpoptoys.com.br', 'https://geekpoptoys.com.br:8443',
  'http://localhost:5173', 'https://geek-toys-home-x.vercel.app',
];

describe('CORS allow-list (family: every caller and every look-alike)', () => {
  it('lists exactly the real callers', () => {
    expect([...SITE_ORIGINS].sort()).toEqual([...ALLOWED].sort());
  });

  it.each(ALLOWED)('allows %s with credentials (GET and preflight)', async (origin) => {
    for (const method of ['GET', 'OPTIONS']) {
      const r = await call(origin, method);
      expect(r.acao, method).toBe(origin);
      expect(r.creds, method).toBe('true');
    }
  });

  it.each(DENIED)('never echoes %s', async (origin) => {
    for (const method of ['GET', 'OPTIONS']) {
      expect((await call(origin, method)).acao, method).toBeNull();
    }
  });

  it('no Origin (curl, webhooks) still works, without an ACAO', async () => {
    const res = await fetch(`${base}/x`);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
