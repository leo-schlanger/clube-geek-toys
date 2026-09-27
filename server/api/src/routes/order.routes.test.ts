import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Order routes over real HTTP.
 *
 * What these pin:
 *  1. Checkout works for a guest and for a member, and the member's identity
 *     reaches the service (it is what applies the discount).
 *  2. "My orders" is keyed by the logged-in user, never by an id in the URL.
 *  3. Everything that moves money after the fact — refund, confirm PIX, buy a
 *     label — is admin-only.
 *  4. The validation in front of the charge: quantities, e-mail, installments.
 */

vi.mock('../config/env.js', async () => (await import('../test-support/env.js')).envModule);
vi.mock('../middleware/rate-limit.js', async () => (await import('../test-support/env.js')).rateLimitModule);
vi.mock('../services/log.service.js', () => ({ createErrorLog: vi.fn(async () => {}) }));

const { orders, labels } = vi.hoisted(() => ({
  orders: {
    createOrder: vi.fn(),
    listMyOrders: vi.fn(),
    getMyOrderById: vi.fn(),
    cancelMyOrder: vi.fn(),
    getOrderStatus: vi.fn(),
    getPublicOrderPix: vi.fn(),
    payOrderWithCard: vi.fn(),
    listOrders: vi.fn(),
    getOrderById: vi.fn(),
    updateOrderStatus: vi.fn(),
    confirmPixOrder: vi.fn(),
    refundOrder: vi.fn(),
    setOrderTracking: vi.fn(),
  },
  labels: { getLabelState: vi.fn(), buyAndPrintLabel: vi.fn(), reprintLabel: vi.fn() },
}));
vi.mock('../services/order.service.js', () => orders);
vi.mock('../services/label.service.js', () => labels);

import { orderRouter } from './order.routes.js';
import { routerClient } from '../test-support/http.js';

const api = routerClient('/orders', orderRouter);
const PRODUCT = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const ORDER = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

const order = {
  items: [{ productId: PRODUCT, quantity: 2 }],
  customer: { name: 'Janaina', email: 'janaina@example.com', document: '52998224725' },
  deliveryMethod: 'pickup',
  paymentMethod: 'pix',
};

beforeEach(() => vi.clearAllMocks());

describe('checkout', () => {
  it('creates an order for a guest and for a member', async () => {
    orders.createOrder.mockResolvedValue({ orderId: ORDER });
    expect((await api.post('/', { body: order })).status).toBe(201);
    expect(orders.createOrder).toHaveBeenLastCalledWith(expect.objectContaining({ paymentMethod: 'pix' }), undefined);

    await api.post('/', { body: order, as: 'member' });
    expect(orders.createOrder).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.objectContaining({ userId: 'user-member', role: 'member' })
    );
  });

  it('validates before any charge is attempted', async () => {
    for (const bad of [
      { ...order, items: [] },
      { ...order, items: [{ productId: PRODUCT, quantity: 0 }] },
      { ...order, items: [{ productId: PRODUCT, quantity: 1000 }] },
      { ...order, customer: { ...order.customer, email: 'nope' } },
      { ...order, paymentMethod: 'boleto' },
      { ...order, items: [{ productId: 'not-a-uuid', quantity: 1 }] },
    ]) {
      expect((await api.post('/', { body: bad })).status).toBe(400);
    }
    expect(orders.createOrder).not.toHaveBeenCalled();
  });

  it('polls the status and recovers the PIX code, 404 when there is none', async () => {
    orders.getOrderStatus.mockResolvedValueOnce({ status: 'paid' }).mockResolvedValueOnce(null);
    expect((await api.get(`/${ORDER}/status`)).body).toEqual({ status: 'paid' });
    expect((await api.get(`/${ORDER}/status`)).status).toBe(404);

    orders.getPublicOrderPix.mockResolvedValueOnce({ qrCode: 'x' }).mockResolvedValueOnce(null);
    expect((await api.get(`/${ORDER}/pix`)).body).toEqual({ qrCode: 'x' });
    expect((await api.get(`/${ORDER}/pix`)).status).toBe(404);
  });

  it('charges a card against the order, within 12 installments', async () => {
    orders.payOrderWithCard.mockResolvedValue({ status: 'pending' });
    await api.post(`/${ORDER}/pay-card`, { body: { card_token: 'card_x', installments: 3 } });
    expect(orders.payOrderWithCard).toHaveBeenCalledWith(ORDER, { cardToken: 'card_x', installments: 3 }, null);
    await api.post(`/${ORDER}/pay-card`, { body: { card_token: 'card_x' }, as: 'member' });
    expect(orders.payOrderWithCard).toHaveBeenLastCalledWith(ORDER, expect.any(Object), 'user-member');
    expect((await api.post(`/${ORDER}/pay-card`, { body: { card_token: 'card_x', installments: 13 } })).status).toBe(400);
  });
});

describe('my orders', () => {
  it('needs a login and filters by tab', async () => {
    expect((await api.get('/me')).status).toBe(401);
    orders.listMyOrders.mockResolvedValue({ orders: [] });
    await api.get('/me?tab=preparing&page=2&limit=5', { as: 'member' });
    expect(orders.listMyOrders).toHaveBeenCalledWith('user-member', { statuses: ['paid', 'processing'], page: 2, limit: 5 });
    await api.get('/me?tab=unknown', { as: 'member' });
    expect(orders.listMyOrders).toHaveBeenLastCalledWith('user-member', { statuses: undefined, page: undefined, limit: undefined });
  });

  it('opens and cancels only through the logged-in user', async () => {
    orders.getMyOrderById.mockResolvedValueOnce({ id: ORDER }).mockResolvedValueOnce(null);
    expect((await api.get(`/me/${ORDER}`, { as: 'member' })).status).toBe(200);
    expect(orders.getMyOrderById).toHaveBeenCalledWith('user-member', ORDER);
    expect((await api.get(`/me/${ORDER}`, { as: 'member' })).status).toBe(404);

    orders.cancelMyOrder.mockResolvedValue({ id: ORDER, status: 'cancelled' });
    await api.post(`/me/${ORDER}/cancel`, { as: 'member' });
    expect(orders.cancelMyOrder).toHaveBeenCalledWith('user-member', ORDER);
  });
});

describe('admin', () => {
  it.each([
    ['get', '/'],
    ['get', `/${ORDER}`],
    ['post', `/${ORDER}/refund`],
    ['post', `/${ORDER}/confirm-pix`],
    ['post', `/${ORDER}/label`],
    ['patch', `/${ORDER}/status`],
  ] as const)('%s %s is admin-only', async (method, route) => {
    expect((await api[method](route)).status).toBe(401);
    expect((await api[method](route, { as: 'member' })).status).toBe(403);
    expect((await api[method](route, { as: 'seller' })).status).toBe(403);
  });

  it('lists and opens orders', async () => {
    orders.listOrders.mockResolvedValue({ orders: [] });
    await api.get('/?status=paid&page=1&limit=20', { as: 'admin' });
    expect(orders.listOrders).toHaveBeenCalledWith({ status: 'paid', page: 1, limit: 20 });
    orders.getOrderById.mockResolvedValueOnce({ id: ORDER }).mockResolvedValueOnce(null);
    expect((await api.get(`/${ORDER}`, { as: 'admin' })).status).toBe(200);
    expect(orders.getOrderById).toHaveBeenCalledWith(ORDER, true);
    expect((await api.get(`/${ORDER}`, { as: 'admin' })).status).toBe(404);
  });

  it('changes status, confirms PIX, refunds and sets tracking', async () => {
    orders.updateOrderStatus.mockResolvedValue({ status: 'shipped' });
    await api.patch(`/${ORDER}/status`, { as: 'admin', body: { status: 'shipped' } });
    expect(orders.updateOrderStatus).toHaveBeenCalledWith(ORDER, 'shipped', 'user-admin');
    expect((await api.patch(`/${ORDER}/status`, { as: 'admin', body: { status: 'lost' } })).status).toBe(400);

    orders.confirmPixOrder.mockResolvedValue({ status: 'paid' });
    await api.post(`/${ORDER}/confirm-pix`, { as: 'admin' });
    expect(orders.confirmPixOrder).toHaveBeenCalledWith(ORDER, 'user-admin');

    orders.refundOrder.mockResolvedValue({ status: 'refunded' });
    await api.post(`/${ORDER}/refund`, { as: 'admin' });
    expect(orders.refundOrder).toHaveBeenCalledWith(ORDER, 'user-admin');

    orders.setOrderTracking.mockResolvedValue({ trackingCode: 'AA123456789BR' });
    await api.patch(`/${ORDER}/tracking`, { as: 'admin', body: { trackingCode: 'AA123456789BR' } });
    expect(orders.setOrderTracking).toHaveBeenCalledWith(ORDER, 'AA123456789BR', 'user-admin', undefined);
    expect((await api.patch(`/${ORDER}/tracking`, { as: 'admin', body: { trackingCode: 'x' } })).status).toBe(400);
  });

  it('reads, buys and reprints the shipping label', async () => {
    labels.getLabelState.mockResolvedValue({ state: 'none' });
    labels.buyAndPrintLabel.mockResolvedValue({ url: 'pdf' });
    labels.reprintLabel.mockResolvedValue({ url: 'pdf2' });
    expect((await api.get(`/${ORDER}/label`, { as: 'admin' })).body).toEqual({ state: 'none' });
    expect((await api.post(`/${ORDER}/label`, { as: 'admin' })).body).toEqual({ url: 'pdf' });
    expect(labels.buyAndPrintLabel).toHaveBeenCalledWith(ORDER, 'user-admin');
    expect((await api.post(`/${ORDER}/label/reprint`, { as: 'admin' })).body).toEqual({ url: 'pdf2' });
  });

  it('passes service errors through the error handler', async () => {
    orders.refundOrder.mockRejectedValue(new Error('gateway down'));
    expect((await api.post(`/${ORDER}/refund`, { as: 'admin' })).status).toBe(500);
  });
});
