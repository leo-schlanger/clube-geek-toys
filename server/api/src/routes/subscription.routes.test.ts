import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Subscription routes over real HTTP.
 *
 * A subscription is a card that gets charged every month. What these pin is
 * who may touch it: its member or staff. Anyone else gets 403 on read, pause,
 * resume, cancel, history and — the one that matters most — swapping the card.
 */

vi.mock('../config/env.js', async () => (await import('../test-support/env.js')).envModule);
vi.mock('../middleware/rate-limit.js', async () => (await import('../test-support/env.js')).rateLimitModule);
vi.mock('../services/log.service.js', () => ({ createErrorLog: vi.fn(async () => {}) }));

const { subs, queryMock } = vi.hoisted(() => ({
  subs: {
    createSubscription: vi.fn(),
    getSubscription: vi.fn(),
    pauseSubscription: vi.fn(),
    resumeSubscription: vi.fn(),
    cancelSubscription: vi.fn(),
    getSubscriptionPayments: vi.fn(),
    updatePaymentMethod: vi.fn(),
  },
  queryMock: vi.fn(),
}));
vi.mock('../services/subscription.service.js', () => subs);
vi.mock('../config/database.js', () => ({ query: queryMock }));

import { subscriptionRouter } from './subscription.routes.js';
import { routerClient } from '../test-support/http.js';

const api = routerClient('/subscription', subscriptionRouter);
const MEMBER = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

function ownedBy(userId: string | null) {
  queryMock.mockResolvedValue({ rows: userId ? [{ user_id: userId }] : [] });
}

beforeEach(() => {
  vi.clearAllMocks();
  subs.getSubscription.mockResolvedValue({ id: 's1', memberId: MEMBER, status: 'active' });
});

describe('create', () => {
  const body = { member_id: MEMBER, payer_email: 'laura@example.com', payer_name: 'Laura', card_token: 'card_x' };

  it("subscribes the member's own membership, filling the defaults", async () => {
    ownedBy('user-member');
    subs.createSubscription.mockResolvedValue({ id: 's1' });
    expect((await api.post('/create', { as: 'member', body })).status).toBe(201);
    expect(subs.createSubscription).toHaveBeenCalledWith(expect.objectContaining({ plan: 'club', frequency_type: 'months', card_token: 'card_x' }));
  });

  it("refuses someone else's membership and a request without login", async () => {
    ownedBy('user-other');
    expect((await api.post('/create', { as: 'member', body })).status).toBe(403);
    expect((await api.post('/create', { body })).status).toBe(401);
    expect((await api.post('/create', { as: 'member', body: { ...body, card_token: '' } })).status).toBe(400);
    expect(subs.createSubscription).not.toHaveBeenCalled();
  });
});

describe('managing a subscription', () => {
  it.each([
    ['get', '/s1'],
    ['put', '/s1/pause'],
    ['put', '/s1/resume'],
    ['put', '/s1/cancel'],
    ['get', '/s1/payments'],
  ] as const)("%s %s is refused to someone else's account", async (method, route) => {
    ownedBy('user-other');
    expect((await api[method](route, { as: 'member' })).status).toBe(403);
  });

  it('lets the owner read, pause, resume, cancel and list payments', async () => {
    ownedBy('user-member');
    subs.pauseSubscription.mockResolvedValue({ status: 'paused' });
    subs.resumeSubscription.mockResolvedValue({ status: 'active' });
    subs.cancelSubscription.mockResolvedValue({ status: 'cancelled' });
    subs.getSubscriptionPayments.mockResolvedValue([{ id: 'p1' }]);

    expect((await api.get('/s1', { as: 'member' })).body.id).toBe('s1');
    expect((await api.put('/s1/pause', { as: 'member' })).body.status).toBe('paused');
    expect((await api.put('/s1/resume', { as: 'member' })).body.status).toBe('active');
    expect((await api.put('/s1/cancel', { as: 'member' })).body.status).toBe('cancelled');
    expect((await api.get('/s1/payments?limit=3', { as: 'member' })).body).toEqual([{ id: 'p1' }]);
    expect(subs.getSubscriptionPayments).toHaveBeenCalledWith('s1', 3);
  });

  it('lets staff manage any subscription without the ownership lookup', async () => {
    subs.cancelSubscription.mockResolvedValue({ status: 'cancelled' });
    expect((await api.put('/s1/cancel', { as: 'admin' })).status).toBe(200);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('404s a subscription that does not exist', async () => {
    subs.getSubscription.mockResolvedValue(null);
    expect((await api.get('/nope', { as: 'admin' })).body.code).toBe('SUBSCRIPTION_NOT_FOUND');
  });
});

describe('swapping the card', () => {
  it("takes a Pagar.me token or a legacy Stripe id, only from the owner", async () => {
    ownedBy('user-member');
    subs.updatePaymentMethod.mockResolvedValue({ ok: true });
    await api.put('/s1/update-payment-method', { as: 'member', body: { cardToken: 'card_new' } });
    expect(subs.updatePaymentMethod).toHaveBeenLastCalledWith('s1', 'card_new');
    await api.put('/s1/update-payment-method', { as: 'member', body: { paymentMethodId: 'pm_legacy' } });
    expect(subs.updatePaymentMethod).toHaveBeenLastCalledWith('s1', 'pm_legacy');

    expect((await api.put('/s1/update-payment-method', { as: 'member', body: {} })).status).toBe(400);

    ownedBy('user-other');
    expect((await api.put('/s1/update-payment-method', { as: 'member', body: { cardToken: 'card_evil' } })).status).toBe(403);
    expect(subs.updatePaymentMethod).toHaveBeenCalledTimes(2);
  });
});
