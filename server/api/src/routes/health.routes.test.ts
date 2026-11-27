import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `GET /health → jobs`: the host crons (backup, off-site, restore drill) only
 * wrote to log files nobody read, so one that stopped running looked like one
 * that worked. Their last success is reported here, and the external monitor
 * fails on `stale: true`.
 */

vi.mock('../config/env.js', async () => (await import('../test-support/env.js')).envModule);

const { poolQuery } = vi.hoisted(() => ({ poolQuery: vi.fn() }));
vi.mock('../config/database.js', () => ({ pool: { query: poolQuery } }));
vi.mock('../db/ensure-schema.js', () => ({
  getSchemaState: () => ({ status: 'ok', ranAt: null, total: 39, failed: [] }),
}));
vi.mock('../services/shipping.service.js', () => ({
  getMelhorEnvioHealth: () => ({ configured: true, sandbox: false, lastFailure: null, lastSuccessAt: null }),
}));
vi.mock('../utils/pagarme.js', () => ({ isPagarmeConfigured: () => true }));
vi.mock('../services/pagarme-webhook.service.js', () => ({ webhookAuthConfigured: () => true }));
vi.mock('../services/reconcile.service.js', () => ({
  lastReconcileRun: async () => new Date().toISOString(),
}));

import { healthRouter } from './health.routes.js';
import { routerClient } from '../test-support/http.js';

import { env } from '../config/env.js';

const api = routerClient('/health', healthRouter);
const TOKEN = 'health-token-with-more-than-32-characters';
const AUTH = { headers: { 'X-Health-Token': TOKEN } };
(env as { HEALTH_TOKEN?: string }).HEALTH_TOKEN = TOKEN;
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000).toISOString();

beforeEach(() => vi.clearAllMocks());

describe('GET /health — jobs', () => {
  it('marca como velho o backup diário sem sucesso há mais de 26h', async () => {
    poolQuery.mockImplementation(async (sql: string) =>
      sql.includes("LIKE 'job_ok_%'")
        ? {
            rows: [
              { key: 'job_ok_backup_daily', at: hoursAgo(30) },
              { key: 'job_ok_offsite_dump', at: hoursAgo(2) },
              { key: 'job_ok_restore_drill', at: hoursAgo(24 * 20) },
            ],
          }
        : { rows: [{ '?column?': 1 }] },
    );

    const res = await api.get('/', AUTH);

    expect(res.status).toBe(200);
    const body = res.body as { status: string; jobs: Record<string, { stale: boolean | null }> };
    expect(body.status).toBe('ok'); // a late backup never blocks the deploy gate
    expect(body.jobs.backup_daily.stale).toBe(true);
    expect(body.jobs.offsite_dump.stale).toBe(false);
    expect(body.jobs.restore_drill.stale).toBe(false);
    // Never reported, and its first run was due long ago: a cron that stopped.
    expect(body.jobs.backup_weekly).toEqual({ lastOk: null, stale: true });
  });

  it('não acusa o drill que ainda não teve a primeira execução, e acusa depois', async () => {
    poolQuery.mockImplementation(async (sql: string) =>
      sql.includes("LIKE 'job_ok_%'") ? { rows: [] } : { rows: [{ '?column?': 1 }] },
    );
    vi.useFakeTimers({ now: new Date('2026-10-19T12:00:00Z'), toFake: ['Date'] });
    try {
      expect((await api.get('/', AUTH)).body.jobs.restore_drill).toEqual({ lastOk: null, stale: null });
      vi.setSystemTime(new Date('2026-11-02T06:00:00Z'));
      expect((await api.get('/', AUTH)).body.jobs.restore_drill).toEqual({ lastOk: null, stale: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('continua respondendo se a leitura dos jobs falhar', async () => {
    poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('job_ok_')) throw new Error('boom');
      return { rows: [{}] };
    });
    const res = await api.get('/', AUTH);
    expect(res.status).toBe(200);
    expect((res.body as { jobs: unknown }).jobs).toBeNull();
  });
});

// The public sees up/down only; schema, payments, jobs and backups are for the
// deploy and the monitors, which send the token.
describe('GET /health — who sees the detail (family: every way to ask)', () => {
  const ok = async () => ({ rows: [{ '?column?': 1 }] });

  it.each([
    ['no header', {}],
    ['wrong token', { 'X-Health-Token': 'x'.repeat(TOKEN.length) }],
    ['prefix of the token', { 'X-Health-Token': TOKEN.slice(0, -1) }],
    ['token plus a char', { 'X-Health-Token': `${TOKEN}x` }],
    ['empty header', { 'X-Health-Token': '' }],
    ['token as Bearer', { Authorization: `Bearer ${TOKEN}` }],
  ])('%s → status and timestamp only', async (_label, headers) => {
    poolQuery.mockImplementation(ok);
    const res = await api.get('/', { headers: headers as Record<string, string> });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['status', 'timestamp']);
  });

  it('the right token → full detail', async () => {
    poolQuery.mockImplementation(ok);
    const res = await api.get('/', AUTH);
    expect(res.body).toHaveProperty('schema');
    expect(res.body).toHaveProperty('payments');
    expect(res.body).toHaveProperty('jobs');
  });

  it('no token configured → nobody gets the detail, not even an empty header', async () => {
    const saved = env.HEALTH_TOKEN;
    (env as { HEALTH_TOKEN?: string }).HEALTH_TOKEN = undefined;
    try {
      poolQuery.mockImplementation(ok);
      for (const headers of [{}, { 'X-Health-Token': '' }, { 'X-Health-Token': 'undefined' }] as Record<string, string>[]) {
        const res = await api.get('/', { headers });
        expect(Object.keys(res.body).sort()).toEqual(['status', 'timestamp']);
      }
    } finally {
      (env as { HEALTH_TOKEN?: string }).HEALTH_TOKEN = saved;
    }
  });

  it('database down → 503 without internals for the public', async () => {
    poolQuery.mockRejectedValue(new Error('down'));
    const pub = await api.get('/');
    expect(pub.status).toBe(503);
    expect(Object.keys(pub.body).sort()).toEqual(['status', 'timestamp']);
    expect((await api.get('/', AUTH)).body.database).toBe('disconnected');
  });
});
