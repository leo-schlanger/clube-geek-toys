import { describe, it, expect } from 'vitest';
import express from 'express';
import type { RequestHandler } from 'express';

/**
 * The real limiters over real HTTP, behind the same `trust proxy` as
 * src/index.ts. Route tests replace them with a pass-through, so this is the
 * only place their limits, messages and keying are checked.
 */

async function hits(limiter: RequestHandler, count: number, xff: (i: number) => string) {
  const app = express();
  app.set('trust proxy', 1);
  app.post('/x', limiter, (_req, res) => {
    res.json({ ok: true });
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const { port } = server.address() as { port: number };
  try {
    const out: { status: number; headers: Headers; body: unknown }[] = [];
    for (let i = 0; i < count; i++) {
      const res = await fetch(`http://127.0.0.1:${port}/x`, {
        method: 'POST',
        headers: { 'X-Forwarded-For': xff(i) },
      });
      out.push({ status: res.status, headers: res.headers, body: await res.json() });
    }
    return out;
  } finally {
    server.close();
  }
}

// A fresh module per test: each limiter keeps its counts in memory.
async function limiters() {
  const { vi } = await import('vitest');
  vi.resetModules();
  return import('./rate-limit.js');
}

describe('rate limits', () => {
  it('login: 20 tries per 5 minutes, then 429 in Portuguese with the standard headers', async () => {
    const { authLimiter } = await limiters();
    const res = await hits(authLimiter, 21, () => '177.1.2.3');
    expect(res.slice(0, 20).every((r) => r.status === 200)).toBe(true);
    expect(res[20].status).toBe(429);
    expect(res[20].body).toEqual({ error: 'Muitas tentativas. Aguarde 5 minutos.' });
    expect(res[0].headers.get('ratelimit-limit')).toBe('20');
    expect(res[0].headers.get('ratelimit-remaining')).toBe('19');
    expect(res[0].headers.get('x-ratelimit-limit')).toBeNull();
  });

  // nginx appends the address it saw; the first entry is whatever the client
  // sent. Rotating that entry must not buy a fresh allowance.
  it('counts by the address nginx saw, not by the one the client claims', async () => {
    const { emailLimiter } = await limiters();
    const res = await hits(emailLimiter, 6, (i) => `10.0.0.${i}, 177.1.2.3`);
    expect(res.slice(0, 5).every((r) => r.status === 200)).toBe(true);
    expect(res[5].status).toBe(429);
  });

  it('keeps separate allowances for separate clients', async () => {
    const { emailLimiter } = await limiters();
    const res = await hits(emailLimiter, 10, (i) => `177.1.2.${i % 2}`);
    expect(res.every((r) => r.status === 200)).toBe(true);
  });

  it('the other limits stay where they were', async () => {
    const { defaultLimiter, publicLookupLimiter, paymentLimiter } = await limiters();
    for (const [limiter, max] of [[defaultLimiter, 100], [publicLookupLimiter, 15], [paymentLimiter, 10]] as const) {
      const res = await hits(limiter, max + 1, () => '177.9.9.9');
      expect(res[max - 1].status).toBe(200);
      expect(res[max].status).toBe(429);
    }
  });
});
