import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Infrastructure alerts. What these pin:
 *  1. The cooldown is claimed in the database, in one statement — a crash loop
 *     sends one e-mail, not one per restart.
 *  2. A suppressed alert sends nothing.
 *  3. Twenty 500s in ten minutes alert once; nineteen do not.
 *  4. Alerting never throws.
 */

const { queryMock, fetchMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  fetchMock: vi.fn(async (..._args: unknown[]) => ({ ok: true, status: 200 })),
}));

vi.mock('../config/database.js', () => ({ query: queryMock }));
vi.mock('../config/env.js', () => ({
  env: {
    RESEND_API_KEY: 're_test',
    FROM_EMAIL: 'Loja <contato@example.com>',
    ADMIN_EMAIL: 'vendas@example.com',
    OPS_ALERT_EMAIL: 'ops@example.com',
  },
}));

import { alertOps, record5xx, reset5xxWindow } from './ops-alert.service.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  reset5xxWindow();
});

const alert = { kind: 'cron_failed' as const, subject: 'Backup falhou', body: 'detalhe <b>' };

describe('alertOps', () => {
  it('manda para OPS_ALERT_EMAIL quando o cooldown está livre', async () => {
    queryMock.mockResolvedValue({ rows: [{ key: 'ops_alert_cron_failed' }] });

    expect(await alertOps(alert)).toBe(true);

    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body.to).toBe('ops@example.com');
    expect(body.subject).toBe('[ALERTA] Backup falhou');
    expect(body.html).toContain('detalhe &lt;b&gt;');
  });

  it('o cooldown é decidido no banco, numa instrução só', async () => {
    queryMock.mockResolvedValue({ rows: [{ key: 'k' }] });
    await alertOps({ ...alert, cooldownMin: 360 });
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/ON CONFLICT \(key\) DO UPDATE/);
    expect(sql).toMatch(/WHERE \(config\.value #>> '\{\}'\)::timestamptz < NOW\(\)/);
    expect(params).toEqual(['ops_alert_cron_failed', 360]);
  });

  it('dentro do cooldown não manda nada', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    expect(await alertOps(alert)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('nunca lança, nem com o banco fora', async () => {
    queryMock.mockRejectedValue(new Error('db down'));
    await expect(alertOps(alert)).resolves.toBe(false);
  });
});

describe('record5xx', () => {
  it('alerta uma vez no vigésimo 500 em dez minutos', async () => {
    queryMock.mockResolvedValue({ rows: [{ key: 'k' }] });
    const t0 = 1_000_000;
    for (let i = 0; i < 19; i++) record5xx('/orders', t0 + i * 1000);
    await Promise.resolve();
    expect(queryMock).not.toHaveBeenCalled();

    record5xx('/orders', t0 + 20_000);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    record5xx('/orders', t0 + 21_000);
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('500 espalhados por mais de dez minutos não alertam', async () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 25; i++) record5xx('/orders', t0 + i * 60_000);
    await new Promise((r) => setTimeout(r, 10));
    expect(queryMock).not.toHaveBeenCalled();
  });
});
