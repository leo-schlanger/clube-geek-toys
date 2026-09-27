import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Product reviews, which pay store credit once per order. What these pin:
 *
 *  1. Only the owner of a **delivered** order reviews it, and only products
 *     that were in it, with a 1–5 rating.
 *  2. The reward is paid once per order. The second review of the same order
 *     hits the unique index: that must roll back **only the credit**
 *     (SAVEPOINT) and keep the reviews — before the savepoint, the COMMIT
 *     became a silent ROLLBACK and the API answered 200 with nothing stored.
 *  3. The product's rating is recomputed from published reviews.
 */

const { queryMock, clientQuery, release, credit, memberIdFor, auditMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  clientQuery: vi.fn(),
  release: vi.fn(),
  credit: { creditUser: vi.fn(), getBalance: vi.fn(), getReviewRewardAmount: vi.fn() },
  memberIdFor: vi.fn(),
  auditMock: vi.fn(async () => {}),
}));
vi.mock('../config/database.js', () => ({
  query: queryMock,
  getClient: async () => ({ query: clientQuery, release }),
}));
vi.mock('../config/env.js', () => ({ env: {} }));
vi.mock('../utils/audit.js', () => ({ auditLog: auditMock }));
vi.mock('../middleware/ownership.js', () => ({ getMemberIdForUser: memberIdFor }));
vi.mock('./store-credit.service.js', () => credit);

import {
  adminListReviews,
  adminSetReviewStatus,
  createOrderReviews,
  listProductReviews,
  listReviewsForOrder,
} from './review.service.js';

const P1 = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const P2 = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

function reviewRow(over: Record<string, unknown> = {}) {
  return { id: 'r1', product_id: P1, order_id: 'o1', user_id: 'u1', rating: 5, status: 'published', created_at: 'x', updated_at: 'x', ...over };
}

/** Orders/items through the pool; the transaction through the client. */
function setup(order: Record<string, unknown> | null, items = [{ id: 'i1', product_id: P1 }]) {
  queryMock.mockImplementation(async (text: string) => {
    if (text.includes('SELECT * FROM orders')) return { rows: order ? [order] : [] };
    if (text.includes('FROM order_items')) return { rows: items };
    return { rows: [] };
  });
  const sql: string[] = [];
  clientQuery.mockImplementation(async (text: string, params: unknown[] = []) => {
    sql.push(text.replace(/\s+/g, ' ').trim());
    if (text.includes('INSERT INTO product_reviews')) return { rows: [reviewRow({ product_id: params[0], rating: params[5] })] };
    return { rows: [] };
  });
  return sql;
}

const delivered = { id: 'o1', status: 'delivered', user_id: 'u1', member_id: 'm1' };

beforeEach(() => {
  vi.clearAllMocks();
  memberIdFor.mockResolvedValue('m1');
  credit.getReviewRewardAmount.mockResolvedValue(2);
  credit.creditUser.mockResolvedValue(7);
  credit.getBalance.mockResolvedValue(5);
});

describe('createOrderReviews', () => {
  it('stores the reviews, refreshes the rating and pays the reward once', async () => {
    const sql = setup(delivered);
    const res = await createOrderReviews('u1', 'o1', [{ productId: P1, rating: 4.7, title: '  Ótimo  ' }]);

    expect(res).toMatchObject({ creditAwarded: 2, newBalance: 7 });
    expect(res.reviews[0].rating).toBe(4);
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO product_reviews'), [
      P1, 'o1', 'i1', 'u1', 'm1', 4, 'Ótimo', null,
    ]);
    expect(sql.some((s) => s.startsWith('UPDATE products p SET rating_avg'))).toBe(true);
    expect(credit.creditUser).toHaveBeenCalledWith('u1', 2, 'review_reward', expect.objectContaining({ orderId: 'o1', reviewId: 'r1' }));
    expect(sql).toEqual(expect.arrayContaining(['SAVEPOINT review_reward', 'RELEASE SAVEPOINT review_reward', 'COMMIT']));
    expect(auditMock).toHaveBeenCalledWith('order.reviewed', 'u1', { orderId: 'o1', reviewCount: 1, creditAwarded: 2 });
  });

  it('keeps the reviews when the order was already rewarded', async () => {
    const sql = setup(delivered);
    credit.creditUser.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));

    const res = await createOrderReviews('u1', 'o1', [{ productId: P1, rating: 5 }]);

    expect(res.creditAwarded).toBe(0);
    expect(res.newBalance).toBe(5);
    expect(sql).toContain('ROLLBACK TO SAVEPOINT review_reward');
    expect(sql.at(-1)).toBe('COMMIT');
    expect(sql).not.toContain('ROLLBACK');
  });

  it('pays nothing when the reward is set to zero', async () => {
    setup(delivered);
    credit.getReviewRewardAmount.mockResolvedValue(0);
    const res = await createOrderReviews('u1', 'o1', [{ productId: P1, rating: 5 }]);
    expect(credit.creditUser).not.toHaveBeenCalled();
    expect(res).toMatchObject({ creditAwarded: 0, newBalance: 5 });
  });

  it('refuses an order that is not delivered, not found or not owned', async () => {
    setup({ ...delivered, status: 'shipped' });
    await expect(createOrderReviews('u1', 'o1', [{ productId: P1, rating: 5 }])).rejects.toMatchObject({ code: 'ORDER_NOT_DELIVERED' });
    setup(null);
    await expect(createOrderReviews('u1', 'o1', [{ productId: P1, rating: 5 }])).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
    setup({ ...delivered, user_id: 'someone', member_id: 'other' });
    await expect(createOrderReviews('u1', 'o1', [{ productId: P1, rating: 5 }])).rejects.toMatchObject({ code: 'ORDER_NOT_OWNED' });
    await expect(createOrderReviews('u1', 'o1', [])).rejects.toMatchObject({ code: 'EMPTY_REVIEWS' });
  });

  it('refuses a product outside the order, a bad rating and a repeated review — rolling back', async () => {
    let sql = setup(delivered);
    await expect(createOrderReviews('u1', 'o1', [{ productId: P2, rating: 5 }])).rejects.toMatchObject({ code: 'PRODUCT_NOT_IN_ORDER' });
    expect(sql).toContain('ROLLBACK');

    setup(delivered);
    await expect(createOrderReviews('u1', 'o1', [{ productId: P1, rating: 9 }])).rejects.toMatchObject({ code: 'INVALID_RATING' });

    sql = setup(delivered);
    clientQuery.mockImplementation(async (text: string) => {
      sql.push(text);
      if (text.includes('INSERT INTO product_reviews')) throw Object.assign(new Error('dup'), { code: '23505' });
      return { rows: [] };
    });
    await expect(createOrderReviews('u1', 'o1', [{ productId: P1, rating: 5 }])).rejects.toMatchObject({ statusCode: 409 });
    expect(release).toHaveBeenCalled();
  });
});

describe('reading', () => {
  it('lists published reviews by slug or id, paged', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: P1 }] })
      .mockResolvedValueOnce({ rows: [reviewRow({ author_name: 'Laura' })] })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });
    const res = await listProductReviews('holder', { page: 2, limit: 100 });
    expect(queryMock.mock.calls[0][0]).toContain('slug = $1');
    expect(res).toMatchObject({ total: 1, page: 2, limit: 50 });
    expect(res.reviews[0].authorName).toBe('Laura');

    queryMock.mockResolvedValueOnce({ rows: [] });
    await expect(listProductReviews(P1)).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
    expect(queryMock.mock.calls.at(-1)![0]).toContain('WHERE id = $1');
  });

  it("shows a customer only their own order's reviews", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ user_id: 'u1', member_id: null }] }).mockResolvedValueOnce({ rows: [reviewRow()] });
    expect(await listReviewsForOrder('u1', 'o1')).toHaveLength(1);

    queryMock.mockResolvedValueOnce({ rows: [{ user_id: 'other', member_id: 'mX' }] });
    await expect(listReviewsForOrder('u1', 'o1')).rejects.toMatchObject({ statusCode: 403 });

    queryMock.mockResolvedValueOnce({ rows: [] });
    expect(await listReviewsForOrder('u1', 'nope')).toEqual([]);
  });
});

describe('moderation', () => {
  it('lists by status and hides a review, refreshing the rating', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [reviewRow({ product_name: 'Holder', product_slug: 'holder' })] })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });
    const list = await adminListReviews({ status: 'published', limit: 500 });
    expect(list.reviews[0]).toMatchObject({ productName: 'Holder', productSlug: 'holder' });
    expect(list.limit).toBe(100);
    expect(queryMock.mock.calls[0][1]).toEqual(['published', 100, 0]);

    queryMock.mockReset();
    queryMock.mockResolvedValueOnce({ rows: [reviewRow({ status: 'hidden' })] }).mockResolvedValue({ rows: [] });
    const hidden = await adminSetReviewStatus('r1', 'hidden', 'admin-1');
    expect(hidden.status).toBe('hidden');
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('rating_avg'), [P1]);
    expect(auditMock).toHaveBeenCalledWith('review.status_changed', 'admin-1', { reviewId: 'r1', status: 'hidden' });

    queryMock.mockReset();
    queryMock.mockResolvedValue({ rows: [] });
    await expect(adminSetReviewStatus('nope', 'hidden', 'a')).rejects.toMatchObject({ code: 'REVIEW_NOT_FOUND' });
  });
});
