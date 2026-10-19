import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The signed-contract e-mail. It used to post to Resend and answer
 * `{status:'sent'}` whatever came back, with no `email_logs` row: a refusal
 * looked exactly like a delivery.
 */

const { queryMock, alertMock } = vi.hoisted(() => ({
  queryMock: vi.fn(async (..._args: unknown[]) => ({ rows: [] as unknown[], rowCount: 1 })),
  alertMock: vi.fn(),
}));
vi.mock('../config/database.js', () => ({ query: queryMock }));
vi.mock('../config/env.js', async () => (await import('../test-support/env.js')).envModule);
vi.mock('./ops-alert.service.js', () => ({ alertOpsAsync: alertMock, record5xx: vi.fn() }));

import { sendContractEmail } from './email.service.js';

const data = {
  to: 'laura@example.com',
  member_name: 'Laura Silva',
  plan: 'Clube',
  signed_at: '2026-10-19',
  hash: 'abc',
  pdf_base64: 'JVBERi0=',
  admin_email: 'equipe@example.com',
};

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const ok = { ok: true, json: async () => ({ id: 'resend_1' }) };
const refused = { ok: false, json: async () => ({ message: 'domain not verified' }) };

describe('sendContractEmail', () => {
  it('sends to the member and the team, with a timeout and a log row each', async () => {
    fetchMock.mockResolvedValue(ok);
    expect(await sendContractEmail(data)).toEqual({ status: 'sent', id: 'resend_1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    const logs = queryMock.mock.calls.filter(([sql]) => String(sql).includes('email_logs'));
    expect(logs.map(([, p]) => (p as unknown[]).slice(0, 2))).toEqual([
      ['laura@example.com', 'sent'],
      ['equipe@example.com', 'sent'],
    ]);
  });

  it('fails loudly when Resend refuses the member copy', async () => {
    fetchMock.mockResolvedValue(refused);
    await expect(sendContractEmail(data)).rejects.toMatchObject({ statusCode: 502, code: 'EMAIL_SEND_FAILED' });
    const logs = queryMock.mock.calls.filter(([sql]) => String(sql).includes('email_logs'));
    expect((logs[0][1] as unknown[])[1]).toBe('failed');
  });

  it('does not fail the member send over the team copy', async () => {
    fetchMock.mockResolvedValueOnce(ok).mockResolvedValueOnce(refused);
    await expect(sendContractEmail(data)).resolves.toMatchObject({ status: 'sent' });
  });
});
