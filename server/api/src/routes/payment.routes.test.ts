import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Membership payment routes over real HTTP, with the real ownership check.
 *
 * What these pin:
 *  1. A member pays only for their own membership (`external_reference`),
 *     and a payment made seconds ago blocks a second one (409).
 *  2. A member sees only their own payments and status — the status route
 *     used to answer about anybody's payment.
 *  3. Confirming, refunding and reconciling are admin-only.
 *  4. The checkout config and the installment table come from the server.
 */

vi.mock('../config/env.js', async () => {
  const base = (await import('../test-support/env.js')).envModule;
  return {
    ...base,
    env: {
      ...base.env,
      PAGARME_PUBLIC_KEY: 'pk_test_1',
      PAGARME_MAX_INSTALLMENTS: 6,
      PAGARME_MIN_INSTALLMENT_AMOUNT: 5,
      PAGARME_PIX_EXPIRES_IN: 3600,
    },
  };
});
vi.mock('../middleware/rate-limit.js', async () => (await import('../test-support/env.js')).rateLimitModule);
vi.mock('../services/log.service.js', () => ({ createErrorLog: vi.fn(async () => {}) }));

const { payments, queryMock, reconcile } = vi.hoisted(() => ({
  payments: {
    findRecentPayment: vi.fn(),
    createPixPayment: vi.fn(),
    createCardPayment: vi.fn(),
    confirmPixPayment: vi.fn(),
    refundPayment: vi.fn(),
    getPayments: vi.fn(),
    userOwnsPayment: vi.fn(),
    getPaymentStatus: vi.fn(),
  },
  queryMock: vi.fn(),
  reconcile: vi.fn(),
}));
vi.mock('../services/payment.service.js', () => payments);
vi.mock('../services/reconcile.service.js', () => ({ reconcilePendingCharges: reconcile }));
vi.mock('../config/database.js', () => ({ query: queryMock }));
vi.mock('../utils/pagarme.js', () => ({
  isPagarmeConfigured: () => true,
  maxInstallmentsFor: (amount: number) => Math.min(6, Math.floor(amount / 5)),
}));

import { paymentRouter } from './payment.routes.js';
import { routerClient } from '../test-support/http.js';

const api = routerClient('/payment', paymentRouter);
const MEMBER = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

/** `members.user_id` for the ownership check. */
function memberOwnedBy(userId: string | null) {
  queryMock.mockImplementation(async (text: string) => {
    if (text.includes('SELECT user_id FROM members')) return { rows: userId ? [{ user_id: userId }] : [] };
    if (text.includes('SELECT id FROM members')) return { rows: userId ? [{ id: MEMBER }] : [] };
    return { rows: [] };
  });
}

const pix = { amount: 12.5, description: 'Clube', payer_email: 'laura@example.com', external_reference: MEMBER };

beforeEach(() => {
  vi.clearAllMocks();
  payments.findRecentPayment.mockResolvedValue(null);
});

describe('public config', () => {
  it('serves the public key and the installment rules', async () => {
    expect((await api.get('/config')).body).toEqual({
      provider: 'pagarme',
      publicKey: 'pk_test_1',
      configured: true,
      maxInstallments: 6,
      minInstallmentAmount: 5,
      pixExpiresIn: 3600,
    });
  });

  it('splits a total into interest-free installments, rounding like the charge', async () => {
    const res = await api.get('/installments?amount=100');
    expect(res.body.maxInstallments).toBe(6);
    expect(res.body.options[2]).toEqual({ installments: 3, amount: 33.33, interestFree: true });
    expect((await api.get('/installments?amount=-1')).body.code).toBe('INVALID_AMOUNT');
    expect((await api.get('/installments?amount=abc')).status).toBe(400);
  });
});

describe('paying for the membership', () => {
  it("creates a PIX for the member's own membership", async () => {
    memberOwnedBy('user-member');
    payments.createPixPayment.mockResolvedValue({ qrCode: 'x' });
    expect((await api.post('/create', { as: 'member', body: pix })).status).toBe(201);
    expect(payments.createPixPayment).toHaveBeenCalledWith({ amount: 12.5, description: 'Clube', payerEmail: 'laura@example.com', memberId: MEMBER });
  });

  it("refuses to charge someone else's membership", async () => {
    memberOwnedBy('user-other');
    expect((await api.post('/create', { as: 'member', body: pix })).status).toBe(403);
    expect((await api.post('/card/create', { as: 'member', body: { ...pix, payer_name: 'L', card_token: 'card_x' } })).status).toBe(403);
    expect(payments.createPixPayment).not.toHaveBeenCalled();
    expect(payments.createCardPayment).not.toHaveBeenCalled();
  });

  it('blocks a second payment right after one', async () => {
    memberOwnedBy('user-member');
    payments.findRecentPayment.mockResolvedValue({ id: 'p1', paid_at: 'now', amount: '12.50' });
    const res = await api.post('/create', { as: 'member', body: pix });
    expect(res.status).toBe(409);
    expect(res.body.details).toEqual({ recentPaymentId: 'p1', paidAt: 'now', amount: 12.5 });

    const card = await api.post('/card/create', { as: 'member', body: { ...pix, payer_name: 'L', card_token: 'card_x' } });
    expect(card.body.code).toBe('RECENT_PAYMENT_EXISTS');
  });

  it('charges a card from a token, and staff can charge for any member', async () => {
    payments.createCardPayment.mockResolvedValue({ status: 'paid' });
    const body = { ...pix, payer_name: 'Laura', card_token: 'card_x', installments: 2 };
    expect((await api.post('/card/create', { as: 'seller', body })).status).toBe(201);
    expect(payments.createCardPayment).toHaveBeenCalledWith(expect.objectContaining({ cardToken: 'card_x', installments: 2, memberId: MEMBER }));
    expect(queryMock).not.toHaveBeenCalled();
    expect((await api.post('/card/create', { as: 'seller', body: { ...body, installments: 13 } })).status).toBe(400);
  });
});

describe('reading payments', () => {
  it('scopes a member to their own payments, ignoring the query', async () => {
    memberOwnedBy('user-member');
    payments.getPayments.mockResolvedValue([]);
    await api.get('/?member_id=someone-else&status=paid&limit=5', { as: 'member' });
    expect(payments.getPayments).toHaveBeenCalledWith({ memberId: MEMBER, status: 'paid', limit: 5 });

    memberOwnedBy(null);
    expect((await api.get('/', { as: 'member' })).body).toEqual([]);

    await api.get('/?member_id=abc', { as: 'admin' });
    expect(payments.getPayments).toHaveBeenLastCalledWith({ memberId: 'abc', status: undefined, limit: undefined });
  });

  it("answers a payment status only to its owner or staff", async () => {
    payments.getPaymentStatus.mockResolvedValue({ status: 'paid' });
    payments.userOwnsPayment.mockResolvedValue(false);
    expect((await api.get('/status/p1', { as: 'member' })).status).toBe(404);
    payments.userOwnsPayment.mockResolvedValue(true);
    expect((await api.get('/status/p1', { as: 'member' })).body).toEqual({ status: 'paid' });
    expect((await api.get('/status/p9', { as: 'seller' })).status).toBe(200);
  });
});

describe('admin', () => {
  it('confirms, refunds and reconciles — admins only', async () => {
    expect((await api.post('/p1/confirm', { as: 'seller' })).status).toBe(403);
    expect((await api.post('/p1/refund', { as: 'member' })).status).toBe(403);
    expect((await api.post('/reconcile')).status).toBe(401);

    payments.confirmPixPayment.mockResolvedValue({ status: 'paid' });
    await api.post('/p1/confirm', { as: 'admin' });
    expect(payments.confirmPixPayment).toHaveBeenCalledWith({ paymentId: 'p1', adminUserId: 'user-admin' });

    payments.refundPayment.mockResolvedValue({ status: 'refunded' });
    await api.post('/p1/refund', { as: 'admin', body: { reason: 'duplicado' } });
    expect(payments.refundPayment).toHaveBeenCalledWith({ paymentId: 'p1', adminUserId: 'user-admin', reason: 'duplicado' });

    reconcile.mockResolvedValue({ checked: 2, settled: 1 });
    expect((await api.post('/reconcile', { as: 'admin' })).body).toEqual({ checked: 2, settled: 1 });
  });
});
