import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Staff payment notices. What these pin: a buyer retrying a refused card gets
 * one notice per order per half hour, not one per attempt (ten in an hour on
 * 01/10/2026) — and every other event still goes out every time.
 */

const { queryMock, sendEmailMock, claimMock } = vi.hoisted(() => ({
  queryMock: vi.fn(async (..._args: unknown[]) => ({ rows: [{ id: 'admin-1' }] })),
  sendEmailMock: vi.fn(async (..._args: unknown[]) => ({})),
  claimMock: vi.fn(async (..._args: unknown[]) => true),
}));

vi.mock('../config/database.js', () => ({ query: queryMock }));
vi.mock('../config/env.js', () => ({
  env: { ADMIN_EMAIL: 'vendas@example.com' },
  adminUrl: (p = '/admin') => `https://adm.geeketoys.com.br${p}`,
}));
vi.mock('./email.service.js', () => ({ sendTemplateEmail: sendEmailMock }));
vi.mock('./settings.service.js', () => ({ getSetting: vi.fn(async () => true) }));
vi.mock('../utils/cooldown.js', () => ({ claimCooldown: claimMock }));

import { notifyAdminsOfPayment } from './admin-notification.service.js';

const refused = {
  event: 'payment_failed' as const,
  subject: 'Pedido #27',
  amount: 1092.5,
  method: 'credit_card',
};

beforeEach(() => vi.clearAllMocks());

describe('notifyAdminsOfPayment — recusas agrupadas', () => {
  it('a primeira recusa do pedido avisa', async () => {
    await notifyAdminsOfPayment(refused);
    expect(claimMock).toHaveBeenCalledWith('notify_failed_Pedido #27', 30);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('as seguintes, dentro de meia hora, não avisam nem no sino', async () => {
    claimMock.mockResolvedValueOnce(false);
    await notifyAdminsOfPayment(refused);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('pagamento recebido nunca passa pelo agrupamento', async () => {
    await notifyAdminsOfPayment({ ...refused, event: 'payment_received' });
    expect(claimMock).not.toHaveBeenCalled();
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('se o agrupamento falhar, avisa mesmo assim', async () => {
    claimMock.mockRejectedValueOnce(new Error('db down'));
    await notifyAdminsOfPayment(refused);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });
});
