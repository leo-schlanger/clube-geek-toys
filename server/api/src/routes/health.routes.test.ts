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

const api = routerClient('/health', healthRouter);
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

    const res = await api.get('/');

    expect(res.status).toBe(200);
    const body = res.body as { status: string; jobs: Record<string, { stale: boolean | null }> };
    expect(body.status).toBe('ok'); // a late backup never blocks the deploy gate
    expect(body.jobs.backup_daily.stale).toBe(true);
    expect(body.jobs.offsite_dump.stale).toBe(false);
    expect(body.jobs.restore_drill.stale).toBe(false);
    // Never reported yet: unknown, not an alarm.
    expect(body.jobs.backup_weekly).toEqual({ lastOk: null, stale: null });
  });

  it('continua respondendo se a leitura dos jobs falhar', async () => {
    poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('job_ok_')) throw new Error('boom');
      return { rows: [{}] };
    });
    const res = await api.get('/');
    expect(res.status).toBe(200);
    expect((res.body as { jobs: unknown }).jobs).toBeNull();
  });
});
