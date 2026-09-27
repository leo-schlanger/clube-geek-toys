import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Report routes: revenue and member numbers are admin-only, and the months
 * window is clamped to 1–24 whatever the query says.
 */

vi.mock('../config/env.js', async () => (await import('../test-support/env.js')).envModule);
vi.mock('../services/log.service.js', () => ({ createErrorLog: vi.fn(async () => {}) }));

const reports = vi.hoisted(() => ({
  getDailyReport: vi.fn(async () => ({ d: 1 })),
  getMonthlyReport: vi.fn(async () => ({ m: 1 })),
  getChurnReport: vi.fn(async () => ({ c: 1 })),
  getPlanDistribution: vi.fn(async () => ({ p: 1 })),
  getTodayRevenue: vi.fn(async () => ({ t: 1 })),
  getRealtimeStats: vi.fn(async () => ({ r: 1 })),
  getActionItems: vi.fn(async () => ({ items: [] })),
  getOverviewReport: vi.fn(async () => ({ o: 1 })),
  isOverviewPeriod: (v: unknown) => v === 'day' || v === 'week' || v === 'month',
}));
vi.mock('../services/report.service.js', () => reports);

import { reportRouter } from './report.routes.js';
import { routerClient } from '../test-support/http.js';

const api = routerClient('/reports', reportRouter);

beforeEach(() => vi.clearAllMocks());

describe('reports', () => {
  it('are admin-only', async () => {
    expect((await api.get('/daily')).status).toBe(401);
    expect((await api.get('/daily', { as: 'seller' })).status).toBe(403);
  });

  it('serve every report', async () => {
    for (const [path, body] of [
      ['/daily', { d: 1 }],
      ['/plan-distribution', { p: 1 }],
      ['/today-revenue', { t: 1 }],
      ['/realtime-stats', { r: 1 }],
      ['/action-items', { items: [] }],
    ] as const) {
      expect((await api.get(path, { as: 'admin' })).body).toEqual(body);
    }
  });

  it('clamp the months window', async () => {
    await api.get('/monthly?months=100', { as: 'admin' });
    expect(reports.getMonthlyReport).toHaveBeenCalledWith(24);
    await api.get('/churn?months=0', { as: 'admin' });
    expect(reports.getChurnReport).toHaveBeenCalledWith(6);
    await api.get('/churn?months=-3', { as: 'admin' });
    expect(reports.getChurnReport).toHaveBeenLastCalledWith(1);
  });

  it('default an unknown overview period to the month', async () => {
    await api.get('/overview?period=year&date=2026-09-01', { as: 'admin' });
    expect(reports.getOverviewReport).toHaveBeenCalledWith('month', '2026-09-01');
    await api.get('/overview?period=week', { as: 'admin' });
    expect(reports.getOverviewReport).toHaveBeenLastCalledWith('week', undefined);
  });

  it('pass a failure to the error handler', async () => {
    reports.getDailyReport.mockRejectedValueOnce(new Error('db'));
    expect((await api.get('/daily', { as: 'admin' })).status).toBe(500);
  });
});
